import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { appStorage } from '../_shared/helpers.js';
import { fetchLiveAppSchema, fetchLiveViews } from './_helpers.js';
import { generateReadme, type AppSchemaData } from '../../gen/docsGenerator.js';
import type { SchemaMeta } from '../../gen/digestGenerator.js';

/**
 * `erakis schema docs` - 接続済み全アプリの LIVE スキーマを取得して docs/schema/README.md を生成する。
 * 指定 env (デフォルト: dev) からフィールド/レイアウト/ビューを取得し、両 env の revision も取得する。
 * getFormFields/getFormLayout/getViews({ preview: true }) 使用 — kintone への書き込みなし。
 * --env dev|prod でフィールド/レイアウト/ビューの取得元 env を選択する（デフォルト: dev）。
 * --env に dev/prod 以外を指定するとエラーで中断する。
 * 出力: dev/prod revision カラム付きの docs/schema/README.md。
 */
export async function schemaDocs(options: { env?: string }) {
    const { customizations } = appStorage.getData();
    const appNames = Object.keys(customizations);

    if (appNames.length === 0) {
        console.error(chalk.red('no apps connected. run `erakis app connect` first.'));
        return;
    }

    const VALID_ENVS = new Set(['dev', 'prod']);
    if (options.env && !VALID_ENVS.has(options.env)) {
        console.error(chalk.red(`--env の値が無効です: "${options.env}"。dev または prod を指定してください。`));
        return;
    }

    const fieldsEnv: 'dev' | 'prod' = options.env === 'prod' ? 'prod' : 'dev';
    const otherEnv: 'dev' | 'prod' = fieldsEnv === 'dev' ? 'prod' : 'dev';
    const appsData: AppSchemaData[] = [];

    for (const appName of appNames) {
        console.log(chalk.gray(`fetching LIVE schema for ${appName} (${fieldsEnv})...`));

        const mainData = await fetchLiveAppSchema(appName, fieldsEnv);
        if (!mainData) {
            console.warn(chalk.yellow(`  skipped ${appName}: LIVE fetch failed`));
            continue;
        }

        const views = await fetchLiveViews(appName, fieldsEnv) ?? {};
        const custom = customizations[appName];
        const env = fieldsEnv === 'dev' ? custom.development : custom.production;

        // もう一方の環境の revision も取得（失敗しても続行）
        console.log(chalk.gray(`fetching LIVE revision for ${appName} (${otherEnv})...`));
        const otherData = await fetchLiveAppSchema(appName, otherEnv);
        const devRevision = fieldsEnv === 'dev' ? mainData.revision : (otherData?.revision ?? undefined);
        const prodRevision = fieldsEnv === 'prod' ? mainData.revision : (otherData?.revision ?? undefined);

        const meta: SchemaMeta = {
            appName,
            environment: fieldsEnv,
            appId: env.appId,
            profileName: env.profileName,
            guestSpaceId: env.guestSpaceId || '',
            spaceId: env.guestSpaceId || '',
            isGuestSpace: Boolean(env.guestSpaceId),
            revision: mainData.revision,
        };

        appsData.push({ appName, meta, fields: mainData.fields, layout: mainData.layout, views, devRevision, prodRevision });
    }

    if (appsData.length === 0) {
        console.error(chalk.yellow('no apps could be fetched from LIVE API.'));
        return;
    }

    const readme = generateReadme(appsData, customizations);
    const docsDir = path.join('docs', 'schema');
    fs.mkdirSync(docsDir, { recursive: true });
    const readmePath = path.join(docsDir, 'README.md');
    fs.writeFileSync(readmePath, readme);

    const size = Math.round(Buffer.byteLength(readme, 'utf8') / 1024 * 10) / 10;
    console.log(chalk.green(`✔ docs generated: ${readmePath} (${appsData.length} apps, ${size}KB)`));
}
