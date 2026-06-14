import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { appStorage, profileStorage, resolveTargetApps } from '../_shared/helpers.js';
import { fetchLiveAppSchema, parseRawAppRef, resolveProfileNameForAppId } from './_helpers.js';
import { createKintoneClient } from '../../utils/kintoneClient.js';
import {
    schemaToDigestRows,
    formatDigestMarkdown,
    formatDigestTsv,
    type SchemaMeta,
} from '../../gen/digestGenerator.js';

/**
 * 未登録 appId の ID ベースのファイル stem を返す純粋関数。
 * ファイル名に使うため、kintone アプリ名ではなく ID で固定する。
 */
export function rawFileStem(appId: string, guestSpaceId?: string): string {
    return guestSpaceId ? `app-${appId}-guest-${guestSpaceId}` : `app-${appId}`;
}

/**
 * CLAUDE.md 向けヒント文を生成する純粋関数。
 * appRef には CLI で使える参照を渡す:
 *   - 登録済みアプリ: appName そのまま
 *   - 未登録 raw:     '123' または '123/999'（app-xxx stem ではない）
 */
export function buildHelpHint(appRef: string): string {
    return [
        '  プロジェクトの CLAUDE.md に以下を追記すると AI が活用できます:',
        '  ----------------------------------------------------------',
        '  # kintone フィールド確認',
        '  フィールド構成の確認は docs/schema/*.digest.md を Grep/Read する。',
        '  特定フィールドの完全定義（選択肢全件・lookup詳細・式全文）は',
        `  \`npx erakis schema get-field ${appRef}\` で取得する。`,
        '  src/app/*/formFields.json は大きいので Read しない。',
        '  スキーマが変わったら `npx erakis schema digest` で再生成する（pull 不要）。',
        '  ----------------------------------------------------------',
    ].join('\n');
}

/**
 * 未登録 appId に対して digest を生成する。
 * ファイル名: ID ベース固定（app-123.raw.digest.md）
 * meta.appName: kintone API から取得したアプリ名（取得失敗時は stem で代替）
 * appRefForHelp: ヒント文の CLI 参照（'123' or '123/999'）
 */
async function digestRawApp(
    appId: string,
    guestSpaceId: string | undefined,
    options: { format?: string; profile?: string },
): Promise<void> {
    const { profiles } = profileStorage.getData();
    const { customizations } = appStorage.getData();

    const profileResult = resolveProfileNameForAppId(
        appId, customizations, Object.keys(profiles), options.profile,
    );
    if ('error' in profileResult) {
        console.error(chalk.red(profileResult.error));
        return;
    }

    const profile = profiles[profileResult.profileName];
    if (!profile) {
        console.error(chalk.red(`profile "${profileResult.profileName}" not found.`));
        return;
    }

    const stem = rawFileStem(appId, guestSpaceId);
    // ヒント文の CLI 参照: '123' or '123/999'（app-xxx は使わない）
    const appRefForHelp = guestSpaceId ? `${appId}/${guestSpaceId}` : appId;
    const client = createKintoneClient(profile, { guestSpaceId });

    // kintone API からアプリ名を取得して meta.appName に使う（取得失敗は stem で代替）
    let displayName: string;
    try {
        const appInfo = await (client.app as any).getApp({ id: appId });
        displayName = (appInfo.name as string) || stem;
    } catch {
        displayName = stem;
    }

    console.log(chalk.gray(`fetching LIVE fields for ${displayName} (appId: ${appId}, raw)...`));

    try {
        const [fieldsResp, layoutResp] = await Promise.all([
            client.app.getFormFields({ app: appId, preview: true }),
            (client.app as any).getFormLayout({ app: appId, preview: true }),
        ]);

        const fields: Record<string, any> = {};
        for (const code of Object.keys(fieldsResp.properties).sort()) {
            fields[code] = fieldsResp.properties[code];
        }
        const layout = (layoutResp as any).layout ?? [];
        const revision = String((fieldsResp as any).revision ?? '');

        const meta: SchemaMeta = {
            appName: displayName,
            environment: 'raw',
            appId,
            profileName: profileResult.profileName,
            guestSpaceId: guestSpaceId || '',
            spaceId: guestSpaceId || '',
            isGuestSpace: Boolean(guestSpaceId),
            revision,
            digestAppRef: appRefForHelp,
        };

        await writeDigest(stem, fields, layout, meta, options.format, 'raw', appRefForHelp);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`failed to fetch ${displayName} (${appId}): ${msg}`));
    }
}

/**
 * --app オプションのルーティングを決定する純粋関数。
 * 登録済みアプリ名が raw appId 形式（数値）と重なる場合、登録済みを優先する。
 */
export function classifyAppOption(
    app: string | undefined,
    registeredNames: string[],
): { type: 'all' } | { type: 'registered' } | { type: 'raw'; appId: string; guestSpaceId?: string } | { type: 'unknown' } {
    if (!app) return { type: 'all' };
    // 登録済みアプリ名が最優先
    if (registeredNames.includes(app)) return { type: 'registered' };
    // 次に数値 appId として解釈を試みる
    const raw = parseRawAppRef(app);
    if (raw) return { type: 'raw', appId: raw.appId, guestSpaceId: raw.guestSpaceId };
    // いずれでもない場合（resolveTargetApps でエラー表示される）
    return { type: 'unknown' };
}

/**
 * `erakis schema digest` - LIVE フィールド/レイアウトを取得して docs/schema/ にダイジェストファイルを書き出す。
 * --app に数値 appId[/guestSpaceId] を指定すると未登録アプリにも対応する（--profile 必須の場合あり）。
 * 登録済みアプリ名は raw appId より優先される。
 * getFormFields({ preview: true }) 使用 — kintone への書き込みなし（読み取り専用）。
 * --env dev|prod でソース環境を選択（デフォルト: dev）。登録済みアプリのみ有効。
 * --format md|tsv で出力フォーマットを選択（デフォルト: md）。
 * 出力先: docs/schema/<appName|app-ID>.<env|raw>.digest.<ext>
 */
export async function schemaDigest(options: { app?: string; format?: string; env?: string; profile?: string }) {
    const { customizations } = appStorage.getData();
    const route = classifyAppOption(options.app, Object.keys(customizations));

    if (route.type === 'raw') {
        await digestRawApp(route.appId, route.guestSpaceId, options);
        return;
    }

    // 登録済みアプリモード（type: 'all' / 'registered' / 'unknown'）
    const targetApps = resolveTargetApps(customizations, options.app);
    if (targetApps === null) return;

    const envKey = options.env === 'prod' ? 'prod' : 'dev';

    for (const appName of targetApps) {
        console.log(chalk.gray(`fetching LIVE fields for ${appName} (${envKey})...`));
        const liveData = await fetchLiveAppSchema(appName, envKey);
        if (!liveData) continue;

        const custom = customizations[appName];
        const env = envKey === 'dev' ? custom.development : custom.production;

        const meta: SchemaMeta = {
            appName,
            environment: envKey,
            appId: env.appId,
            profileName: env.profileName,
            guestSpaceId: env.guestSpaceId || '',
            spaceId: env.guestSpaceId || '',
            isGuestSpace: Boolean(env.guestSpaceId),
            revision: liveData.revision,
        };

        await writeDigest(appName, liveData.fields, liveData.layout, meta, options.format, envKey);
    }
}

/**
 * フィールド/レイアウトをダイジェストドキュメントに整形して docs/schema/ に書き出す。
 * @param appName       - ファイル stem に使う名前（登録済み: appName / raw: 'app-123'）
 * @param format        - 'md'（デフォルト）または 'tsv'
 * @param env           - 出力ファイル名の環境ラベル（dev / prod / raw）
 * @param appRefForHelp - CLAUDE.md ヒント文に使う CLI 参照（省略時は appName）
 *                        登録済みアプリは appName と同じ。
 *                        raw: '123' または '123/999'（app-xxx stem ではない）
 */
export async function writeDigest(
    appName: string,
    fields: Record<string, unknown>,
    layout: unknown[],
    meta: SchemaMeta,
    format = 'md',
    env = 'dev',
    appRefForHelp?: string,
): Promise<void> {
    const rows = schemaToDigestRows(fields, layout);
    const digestDir = path.join('docs', 'schema');
    fs.mkdirSync(digestDir, { recursive: true });

    const content = format === 'tsv'
        ? formatDigestTsv(rows, meta)
        : formatDigestMarkdown(rows, meta);
    const ext = format === 'tsv' ? 'tsv' : 'md';
    const digestPath = path.join(digestDir, `${appName}.${env}.digest.${ext}`);
    fs.writeFileSync(digestPath, content);

    const fieldCount = rows.filter(r => !r.isSpacer).length;
    const size = Math.round(Buffer.byteLength(content, 'utf8') / 1024 * 10) / 10;
    console.log(chalk.green(`✔ digest generated: ${digestPath} (${fieldCount} fields, ${size}KB)`));
    console.log('');
    console.log(buildHelpHint(appRefForHelp ?? appName));
}
