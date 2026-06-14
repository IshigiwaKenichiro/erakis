import chalk from 'chalk';
import inq from 'inquirer';
import fs from 'fs-extra';
import { resolveAppRef, fetchLiveRevision, checkRevisionResult, parseRawAppRef, resolveFilePath } from './_helpers.js';
import { sanitizeViewsForUpdate } from '../../utils/schemaWriter.js';

// ---------------------------------------------------------------------------
// 純粋関数
// ---------------------------------------------------------------------------

/**
 * --to オプションからソース/ターゲット環境を決定する純粋関数。
 * sync-views は必ず反対側 env からコピーする（to dev → from prod）。
 */
export function resolveViewsSyncEnvs(
    toEnv: string | undefined,
): { from: 'dev' | 'prod'; to: 'dev' | 'prod' } | { error: string } {
    if (toEnv === 'dev')  return { from: 'prod', to: 'dev' };
    if (toEnv === 'prod') return { from: 'dev',  to: 'prod' };
    return { error: '--to dev または --to prod が必要です。' };
}

/**
 * ファイルや標準入力由来の JSON を views オブジェクトに正規化する純粋関数。
 * get-views が出力する { views: {...} } 形式と素のマップ { "viewName": {...} } の両方を受け付ける。
 *
 * 優先規則: raw.views がオブジェクト（かつ配列でない）ならラッパー形式とみなす。
 * これにより get-views → (編集) → update-views のラウンドトリップが成立する。
 *
 * 曖昧ケースの注記: "views" という名前のビューを含む素のマップを渡した場合、
 * raw.views がオブジェクトと判定されラッパーとして扱われる。
 * get-views 出力（ラッパー形式）を正しく処理するためこの規則を優先する。
 * 素のマップを直接渡したい場合は "views" という名前のビューを避けること。
 */
export function parseViewsInput(
    raw: unknown,
): Record<string, any> | { error: string } {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { error: 'invalid views format: expected object or { views: {...} }' };
    }
    const obj = raw as Record<string, unknown>;
    // ラッパー形式: { views: { ... } }
    if ('views' in obj && obj.views !== null && typeof obj.views === 'object' && !Array.isArray(obj.views)) {
        return obj.views as Record<string, any>;
    }
    // 素のマップ形式: { "viewName": {...}, ... }
    return obj as Record<string, any>;
}

// ---------------------------------------------------------------------------
// コマンド実装
// ---------------------------------------------------------------------------

/**
 * `erakis schema get-views <appRef> [filePath]`
 * preview のビュー定義を取得する。filePath 省略時は標準出力（パイプ互換のため装飾なし）。
 * 出力形式は { views: {...} }（id を含む getViews レスポンスラッパー）。
 * この出力を無編集で update-views に渡せる（update 側で id を自動 sanitize）。
 * LIVE preview 読み取り専用。
 */
export async function schemaGetViews(
    appRef: string | undefined,
    filePath: string | undefined,
    options: { env?: string; profile?: string },
): Promise<void> {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema get-views phase3test'));
        console.error(chalk.gray('  example: erakis schema get-views phase3test -e prod'));
        console.error(chalk.gray('  example: erakis schema get-views 463'));
        return;
    }

    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref) return;

    try {
        const resp = await ref.client.app.getViews({ app: ref.appId, preview: true } as any);
        const views = (resp as any).views;
        const output = { views };

        if (filePath) {
            const resolved = resolveFilePath(filePath);
            await fs.outputJSON(resolved, output, { spaces: 2 });
            console.error(chalk.green(`✔ views を ${resolved} に書き出しました。`));
        } else {
            // 標準出力は純粋 JSON のみ（chalk 装飾なし。パイプで jq に渡せる形を保つ）
            process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to get views: ${msg}`));
    }
}

/**
 * `erakis schema update-views <appRef> <filePath>`
 * filePath の JSON でビュー定義を更新する（deploy しない）。
 * { views: {...} } 形式と素のマップ {...} の両形式を受け付ける。
 * get-views 出力（id 入り）をそのまま渡した場合は sanitizeViewsForUpdate で id を自動除去する。
 * preview 書き込み - updateViews（全置換）。revision 楽観ロックあり。
 */
export async function schemaUpdateViews(
    appRef: string | undefined,
    filePath: string | undefined,
    options: { env?: string; profile?: string; yes?: boolean },
): Promise<void> {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema update-views phase3test views.json'));
        console.error(chalk.gray('  example: erakis schema update-views 463 views.json'));
        return;
    }
    if (!filePath) {
        console.error(chalk.red('filePath is required.'));
        console.error(chalk.gray('  example: erakis schema update-views phase3test views.json'));
        return;
    }

    const resolvedPath = resolveFilePath(filePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error(chalk.red(`file not found: ${resolvedPath}`));
        return;
    }

    let raw: unknown;
    try {
        raw = await fs.readJSON(resolvedPath);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to read ${resolvedPath}: ${msg}`));
        return;
    }

    const parsed = parseViewsInput(raw);
    if ('error' in parsed) {
        console.error(chalk.red(parsed.error));
        return;
    }
    const views = sanitizeViewsForUpdate(parsed);

    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref) return;

    const viewCount = Object.keys(views).length;
    console.log(chalk.gray(`updating views for ${ref.label} (app ${ref.appId}): ${viewCount} views`));
    console.log(chalk.yellow('⚠  updateViews は全置換です。既存ビューが完全に上書きされます。'));

    if (!options.yes) {
        const { ok } = await inq.prompt([{
            type: 'confirm',
            name: 'ok',
            message: `views を全置換しますか？`,
            default: false,
        }]);
        if (!ok) { console.log(chalk.gray('キャンセルしました。')); return; }
    }

    const revisionRaw = await fetchLiveRevision(ref.client, ref.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) { console.error(chalk.red(`✗ ${revisionCheck.error}`)); return; }

    try {
        await ref.client.app.updateViews({
            app: ref.appId,
            views,
            revision: revisionCheck.revision,
        } as any);
        console.log(chalk.green(`✔ views updated (app ${ref.appId}). deploy で本番反映できます。`));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ updateViews failed: ${msg}`));
    }
}

/**
 * `erakis schema sync-views <appName> --to <dev|prod>`
 * appName の反対側 env の preview views をターゲット env へコピーする（deploy しない）。
 * id は sanitizeViewsForUpdate で自動除去。
 * --to prod には確認プロンプトあり（-y でスキップ）。
 * appId 形式は受け付けない（両 env 登録が必要な操作のため）。
 * LIVE preview ソース読み取り / preview ターゲット書き込み。revision 楽観ロックあり。
 */
export async function schemaSyncViews(
    appName: string | undefined,
    options: { to?: string; yes?: boolean; profile?: string },
): Promise<void> {
    if (!appName) {
        console.error(chalk.red('appName is required.'));
        console.error(chalk.gray('  example: erakis schema sync-views phase3test --to prod'));
        return;
    }

    if (parseRawAppRef(appName)) {
        console.error(chalk.red('sync-views requires an app name, not a numeric app ID.'));
        console.error(chalk.gray('  sync-views needs both dev and prod registered in apps.json.'));
        return;
    }

    const envs = resolveViewsSyncEnvs(options.to);
    if ('error' in envs) {
        console.error(chalk.red(envs.error));
        console.error(chalk.gray('  example: erakis schema sync-views phase3test --to prod'));
        return;
    }

    const { from: fromEnv, to: toEnv } = envs;

    if (toEnv === 'prod' && !options.yes) {
        const { ok } = await inq.prompt([{
            type: 'confirm',
            name: 'ok',
            message: `${appName} の views を ${fromEnv} → prod へ同期しますか？`,
            default: false,
        }]);
        if (!ok) { console.log(chalk.gray('キャンセルしました。')); return; }
    }

    const srcRef = await resolveAppRef(appName, { env: fromEnv, profile: options.profile });
    if (!srcRef) return;

    console.log(chalk.gray(`fetching LIVE views from ${srcRef.label} (app ${srcRef.appId})...`));
    let views: Record<string, any>;
    try {
        const resp = await srcRef.client.app.getViews({ app: srcRef.appId, preview: true } as any);
        views = sanitizeViewsForUpdate((resp as any).views ?? {});
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to fetch views: ${msg}`));
        return;
    }

    const dstRef = await resolveAppRef(appName, { env: toEnv, profile: options.profile });
    if (!dstRef) return;

    const revisionRaw = await fetchLiveRevision(dstRef.client, dstRef.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) { console.error(chalk.red(`✗ ${revisionCheck.error}`)); return; }

    try {
        await dstRef.client.app.updateViews({
            app: dstRef.appId,
            views,
            revision: revisionCheck.revision,
        } as any);
        console.log(chalk.green(`✔ views synced ${fromEnv} → ${toEnv} (app ${dstRef.appId}). deploy で本番反映できます。`));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ sync-views failed: ${msg}`));
    }
}
