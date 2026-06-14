import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { profileStorage, appStorage, resolveTargetApps, makeSnapshotId } from '../_shared/helpers.js';
import { createKintoneClient } from '../../utils/kintoneClient.js';
import type { SchemaMeta } from '../../gen/digestGenerator.js';

/**
 * `erakis schema pull` - 接続済み全アプリ (dev+prod) のスナップショットを kintone-app/snapshots/<timestamp>/ に保存する。
 * LIVE preview API でフィールド・レイアウト・ビュー・メタを取得する。
 * JSON ファイルを kintone-app/snapshots/<id>/<env>/<appName>/ に書き出す。
 * --no-latest を渡さない限り kintone-app/latest.json も更新する。
 * kintone への書き込み・デプロイなし（読み取り専用）。
 */
export async function schemaPull(options: { app?: string; latest?: boolean }) {
    const { customizations } = appStorage.getData();
    const { profiles } = profileStorage.getData();

    const targetApps = resolveTargetApps(customizations, options.app);
    if (targetApps === null) return;

    const snapshotId = makeSnapshotId();
    const snapshotBase = path.join('kintone-app', 'snapshots', snapshotId);

    console.log(chalk.gray(`snapshot: ${snapshotId}`));

    const manifestApps: any[] = [];

    for (const appName of targetApps) {
        const custom = customizations[appName];
        const manifestEntry: any = { appName };

        for (const envKey of ['dev', 'prod'] as const) {
            const env = envKey === 'dev' ? custom.development : custom.production;
            const profile = profiles[env.profileName];

            if (!profile) {
                console.error(chalk.red(`  profile "${env.profileName}" not found for app "${appName}" (${envKey}).`));
                manifestEntry[envKey] = { appId: env.appId, profileName: env.profileName, status: 'failed', error: 'profile not found' };
                continue;
            }

            console.log(chalk.gray(`  pulling ${appName} (${envKey})...`));

            try {
                const client = createKintoneClient(profile, { guestSpaceId: env.guestSpaceId || undefined });
                const [fieldsResp, layoutResp, viewsResp] = await Promise.all([
                    client.app.getFormFields({ app: env.appId, preview: true }),
                    client.app.getFormLayout({ app: env.appId, preview: true } as any),
                    client.app.getViews({ app: env.appId, preview: true } as any),
                ]);

                const sortedFields: Record<string, unknown> = {};
                for (const code of Object.keys(fieldsResp.properties).sort()) {
                    sortedFields[code] = fieldsResp.properties[code];
                }

                const revision = String((fieldsResp as any).revision ?? '');
                const appDir = path.join(snapshotBase, envKey, appName);
                fs.mkdirSync(appDir, { recursive: true });

                fs.writeJSONSync(path.join(appDir, 'fields.json'), sortedFields, { spaces: '\t' });
                fs.writeJSONSync(path.join(appDir, 'layout.json'), (layoutResp as any).layout, { spaces: '\t' });
                fs.writeJSONSync(path.join(appDir, 'views.json'), (viewsResp as any).views, { spaces: '\t' });

                const meta: SchemaMeta = {
                    appName,
                    environment: envKey,
                    appId: env.appId,
                    profileName: env.profileName,
                    guestSpaceId: env.guestSpaceId || '',
                    spaceId: env.guestSpaceId || '',
                    isGuestSpace: Boolean(env.guestSpaceId),
                    revision,
                };
                fs.writeJSONSync(path.join(appDir, 'meta.json'), meta, { spaces: '\t' });

                manifestEntry[envKey] = { appId: env.appId, profileName: env.profileName, revision, status: 'success' };
                console.log(chalk.green(`  ✔ ${appName} (${envKey}) revision=${revision}`));
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(chalk.red(`  ✗ ${appName} (${envKey}): ${msg}`));
                manifestEntry[envKey] = { appId: env.appId, profileName: env.profileName, status: 'failed', error: msg };
            }
        }

        manifestApps.push(manifestEntry);
    }

    const manifest = {
        snapshotId,
        createdAt: new Date().toISOString(),
        apps: manifestApps,
    };
    fs.writeJSONSync(path.join(snapshotBase, 'manifest.json'), manifest, { spaces: '\t' });

    if (options.latest !== false) {
        fs.mkdirSync('kintone-app', { recursive: true });
        fs.writeJSONSync(path.join('kintone-app', 'latest.json'), { snapshotId, createdAt: manifest.createdAt }, { spaces: '\t' });
    }

    console.log('');
    console.log(chalk.green(`✔ snapshot saved: ${snapshotBase}`));
    if (options.latest !== false) console.log(chalk.gray(`  latest.json updated`));
}
