import chalk from 'chalk';
import path from 'path';
import { profileStorage, appStorage } from '../_shared/helpers.js';
import { createKintoneClient } from '../../utils/kintoneClient.js';
/**
 * ファイルパス引数を絶対パスに正規化して返す。
 * 相対パスは process.cwd() 基準で解決する。
 * Windows 絶対パス（C:\...）・UNC パス・スペース含みパスをそのまま通す。
 */
export function resolveFilePath(filePath) {
    return path.resolve(filePath);
}
/**
 * LIVE kintone preview API からフィールドとレイアウトを取得する。
 * getFormFields({ preview: true }) と getFormLayout({ preview: true }) を使用する。
 * ソート済みフィールド・生レイアウト配列・現在の preview revision を返す。
 * 失敗時は null を返してエラーを出力する。kintone の状態を変更しない読み取り専用操作。
 * @param appName - 登録済みカスタマイズ名
 * @param envKey  - 'dev' または 'prod' 環境
 */
export async function fetchLiveAppSchema(appName, envKey) {
    const { customizations } = appStorage.getData();
    const { profiles } = profileStorage.getData();
    const custom = customizations[appName];
    if (!custom) {
        console.error(chalk.red(`application "${appName}" not found.`));
        return null;
    }
    const env = envKey === 'dev' ? custom.development : custom.production;
    const profile = profiles[env.profileName];
    if (!profile) {
        console.error(chalk.red(`profile "${env.profileName}" not found for app "${appName}" (${envKey}).`));
        return null;
    }
    try {
        const client = createKintoneClient(profile, { guestSpaceId: env.guestSpaceId || undefined });
        const [fieldsResp, layoutResp] = await Promise.all([
            client.app.getFormFields({ app: env.appId, preview: true }),
            client.app.getFormLayout({ app: env.appId, preview: true }),
        ]);
        const fields = {};
        for (const code of Object.keys(fieldsResp.properties).sort()) {
            fields[code] = fieldsResp.properties[code];
        }
        return {
            fields,
            layout: layoutResp.layout,
            revision: String(fieldsResp.revision ?? ''),
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`failed to fetch ${appName} (${envKey}): ${msg}`));
        return null;
    }
}
/**
 * アプリの現在の preview revision を取得する。
 * API 呼び出し失敗時は null を返す（呼び出し元は書き込み中断として扱うこと）。
 * 書き込み系コマンドの前に最新 revision 番号を取得するために使用する。
 * @param client - KintoneRestAPIClient インスタンス
 * @param appId  - 対象アプリ ID
 */
export async function fetchLiveRevision(client, appId) {
    try {
        const resp = await client.app.getFormFields({ app: appId, preview: true });
        const revision = String(resp.revision ?? '');
        return revision || null;
    }
    catch {
        return null;
    }
}
/**
 * アプリの LIVE preview ビューを取得する。
 * getViews({ preview: true }) を使用する。失敗時は null を返す。
 * kintone の状態を変更しない読み取り専用操作。
 * @param appName - 登録済みカスタマイズ名
 * @param envKey  - 'dev' または 'prod' 環境
 */
export async function fetchLiveViews(appName, envKey) {
    const { customizations } = appStorage.getData();
    const { profiles } = profileStorage.getData();
    const custom = customizations[appName];
    if (!custom) {
        console.error(chalk.red(`application "${appName}" not found.`));
        return null;
    }
    const env = envKey === 'dev' ? custom.development : custom.production;
    const profile = profiles[env.profileName];
    if (!profile) {
        console.error(chalk.red(`profile "${env.profileName}" not found for app "${appName}" (${envKey}).`));
        return null;
    }
    try {
        const client = createKintoneClient(profile, { guestSpaceId: env.guestSpaceId || undefined });
        const resp = await client.app.getViews({ app: env.appId, preview: true });
        return resp.views;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`failed to fetch views for ${appName} (${envKey}): ${msg}`));
        return null;
    }
}
/**
 * LIVE revision 取得結果を検証する。
 * null は取得失敗を示し、abort が必要。
 */
export function checkRevisionResult(revision) {
    if (revision === null) {
        return { ok: false, error: '対象環境の revision 取得に失敗しました。書き込みを中断します。' };
    }
    return { ok: true, revision };
}
/**
 * 生 appRef 文字列を数値 appId とオプションの guestSpaceId に分解する。
 * 数値でない場合（アプリ名の場合）は null を返す。
 */
export function parseRawAppRef(arg) {
    const m = /^(\d+)(?:\/(\d+))?$/.exec(arg);
    if (!m)
        return null;
    return { appId: m[1], guestSpaceId: m[2] ?? undefined };
}
/**
 * 数値 appId に対応するプロファイル名を選択する純粋関数。
 * 優先順位: 1. apps.json 照合, 2. 明示的な profileHint, 3. プロファイルが1件のみ。
 * プロファイル名、または失敗理由文字列（呼び出し元が報告）のいずれかを返す。
 */
export function resolveProfileNameForAppId(appId, customizations, allProfileNames, profileHint) {
    // 1. apps.json から一致する appId を検索
    for (const custom of Object.values(customizations)) {
        for (const env of [custom.development, custom.production]) {
            if (env.appId === appId) {
                return { profileName: env.profileName };
            }
        }
    }
    // 2. 明示的なヒント
    if (profileHint)
        return { profileName: profileHint };
    // 3. プロファイルが1件の場合のフォールバック
    if (allProfileNames.length === 1)
        return { profileName: allProfileNames[0] };
    return { error: `cannot resolve profile for app ${appId}. specify --profile <name>.` };
}
/**
 * appRef 文字列を kintone クライアントと対象識別子に解決する。
 * 2 つの形式をサポート:
 *   - appName       → .erakis/apps.json を参照し、--env（デフォルト dev）を使用
 *   - appId[/guestSpaceId] → 数値形式; resolveProfileNameForAppId の優先順位でプロファイルを解決
 * 失敗時は null を返してメッセージを出力する。
 */
export async function resolveAppRef(arg, options = {}) {
    const { profiles } = profileStorage.getData();
    const { customizations } = appStorage.getData();
    const raw = parseRawAppRef(arg);
    if (raw) {
        const { appId, guestSpaceId } = raw;
        const result = resolveProfileNameForAppId(appId, customizations, Object.keys(profiles), options.profile);
        if ('error' in result) {
            console.error(chalk.red(result.error));
            return null;
        }
        const profile = profiles[result.profileName];
        if (!profile) {
            console.error(chalk.red(`profile "${result.profileName}" not found.`));
            return null;
        }
        const client = createKintoneClient(profile, { guestSpaceId: guestSpaceId || undefined });
        const label = guestSpaceId ? `${appId}/${guestSpaceId}` : appId;
        return { client, appId, guestSpaceId, label };
    }
    // appName 形式
    const custom = customizations[arg];
    if (!custom) {
        console.error(chalk.red(`application "${arg}" not found.`));
        return null;
    }
    const envKey = options.env === 'prod' ? 'prod' : 'dev';
    const env = envKey === 'dev' ? custom.development : custom.production;
    const profile = profiles[env.profileName];
    if (!profile) {
        console.error(chalk.red(`profile "${env.profileName}" not found for "${arg}" (${envKey}).`));
        return null;
    }
    const client = createKintoneClient(profile, { guestSpaceId: env.guestSpaceId || undefined });
    return { client, appId: env.appId, guestSpaceId: env.guestSpaceId || undefined, label: `${arg}(${envKey})` };
}
