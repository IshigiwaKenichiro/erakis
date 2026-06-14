import chalk from 'chalk';
import inq from 'inquirer';
import fs from 'fs-extra';
import { resolveAppRef, fetchLiveRevision, checkRevisionResult, parseRawAppRef, resolveFilePath } from './_helpers.js';

// ---------------------------------------------------------------------------
// 純粋関数
// ---------------------------------------------------------------------------

/**
 * --to オプションからソース/ターゲット環境を決定する純粋関数。
 * sync-layout は必ず反対側 env からコピーする（to dev → from prod）。
 */
export function resolveLayoutSyncEnvs(
    toEnv: string | undefined,
): { from: 'dev' | 'prod'; to: 'dev' | 'prod' } | { error: string } {
    if (toEnv === 'dev')  return { from: 'prod', to: 'dev' };
    if (toEnv === 'prod') return { from: 'dev',  to: 'prod' };
    return { error: '--to dev または --to prod が必要です。' };
}

/**
 * ファイルや標準入力由来の JSON を layout 配列に正規化する純粋関数。
 * get-layout が出力する { layout: [...] } 形式と素の配列 [...] の両方を受け付ける。
 * これにより get-layout → (編集) → update-layout のラウンドトリップが成立する。
 */
export function parseLayoutInput(
    raw: unknown,
): any[] | { error: string } {
    if (Array.isArray(raw)) return raw;
    if (raw !== null && typeof raw === 'object' && Array.isArray((raw as any).layout)) {
        return (raw as any).layout;
    }
    return { error: 'invalid layout format: expected array or { layout: [...] }' };
}

// ---------------------------------------------------------------------------
// コマンド実装
// ---------------------------------------------------------------------------

/**
 * `erakis schema get-layout <appRef> [filePath]`
 * preview のレイアウトを取得する。filePath 省略時は標準出力（パイプ互換のため装飾なし）。
 * 出力形式は { layout: [...] }（getFormLayout レスポンスラッパー）。
 * この出力を無編集で update-layout に渡せる（ラウンドトリップ保証）。
 * LIVE preview 読み取り専用。
 */
export async function schemaGetLayout(
    appRef: string | undefined,
    filePath: string | undefined,
    options: { env?: string; profile?: string },
): Promise<void> {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema get-layout phase3test'));
        console.error(chalk.gray('  example: erakis schema get-layout phase3test -e prod'));
        console.error(chalk.gray('  example: erakis schema get-layout 463'));
        return;
    }

    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref) return;

    try {
        const resp = await ref.client.app.getFormLayout({ app: ref.appId, preview: true } as any);
        const layout = (resp as any).layout;
        const output = { layout };

        if (filePath) {
            const resolved = resolveFilePath(filePath);
            await fs.outputJSON(resolved, output, { spaces: 2 });
            console.error(chalk.green(`✔ layout を ${resolved} に書き出しました。`));
        } else {
            // 標準出力は純粋 JSON のみ（chalk 装飾なし。パイプで jq に渡せる形を保つ）
            process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to get layout: ${msg}`));
    }
}

/**
 * `erakis schema update-layout <appRef> <filePath>`
 * filePath の JSON でレイアウトを全置換する（deploy しない）。
 * { layout: [...] } 形式と素の配列 [...] の両形式を受け付ける。
 * validateLayoutCodes は実施しない（明示ファイル操作なので手書き JSON も許容。
 * 不正コードは kintone API が 400 で弾く）。
 * preview 書き込み - updateFormLayout（全置換）。
 */
export async function schemaUpdateLayout(
    appRef: string | undefined,
    filePath: string | undefined,
    options: { env?: string; profile?: string; yes?: boolean; force?: boolean },
): Promise<void> {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema update-layout phase3test layout.json'));
        console.error(chalk.gray('  example: erakis schema update-layout 463 layout.json'));
        return;
    }
    if (!filePath) {
        console.error(chalk.red('filePath is required.'));
        console.error(chalk.gray('  example: erakis schema update-layout phase3test layout.json'));
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

    const parsed = parseLayoutInput(raw);
    if ('error' in parsed) {
        console.error(chalk.red(parsed.error));
        return;
    }
    const layout = parsed;

    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref) return;

    console.log(chalk.gray(`updating layout for ${ref.label} (app ${ref.appId}): ${layout.length} items`));
    console.log(chalk.yellow('⚠  updateFormLayout は全置換です。既存レイアウトが完全に上書きされます。'));

    if (!options.yes) {
        const { ok } = await inq.prompt([{
            type: 'confirm',
            name: 'ok',
            message: `layout を全置換しますか？`,
            default: false,
        }]);
        if (!ok) { console.log(chalk.gray('キャンセルしました。')); return; }
    }

    const revisionRaw = await fetchLiveRevision(ref.client, ref.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) { console.error(chalk.red(`✗ ${revisionCheck.error}`)); return; }

    try {
        await ref.client.app.updateFormLayout({
            app: ref.appId,
            layout,
            revision: revisionCheck.revision,
        } as any);
        console.log(chalk.green(`✔ layout updated (app ${ref.appId}). deploy で本番反映できます。`));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ updateFormLayout failed: ${msg}`));
    }
}

/**
 * `erakis schema sync-layout <appName> --to <dev|prod>`
 * appName の反対側 env の preview layout をターゲット env へコピーする（deploy しない）。
 * --to prod には確認プロンプトあり（-y でスキップ）。
 * appId 形式は受け付けない（両 env 登録が必要な操作のため）。
 * LIVE preview ソース読み取り / preview ターゲット書き込み。
 */
export async function schemaSyncLayout(
    appName: string | undefined,
    options: { to?: string; yes?: boolean; profile?: string },
): Promise<void> {
    if (!appName) {
        console.error(chalk.red('appName is required.'));
        console.error(chalk.gray('  example: erakis schema sync-layout phase3test --to prod'));
        return;
    }

    // appId 形式（数値）は拒否
    if (parseRawAppRef(appName)) {
        console.error(chalk.red('sync-layout requires an app name, not a numeric app ID.'));
        console.error(chalk.gray('  sync-layout needs both dev and prod registered in apps.json.'));
        return;
    }

    const envs = resolveLayoutSyncEnvs(options.to);
    if ('error' in envs) {
        console.error(chalk.red(envs.error));
        console.error(chalk.gray('  example: erakis schema sync-layout phase3test --to prod'));
        return;
    }

    const { from: fromEnv, to: toEnv } = envs;

    if (toEnv === 'prod' && !options.yes) {
        const { ok } = await inq.prompt([{
            type: 'confirm',
            name: 'ok',
            message: `${appName} の layout を ${fromEnv} → prod へ同期しますか？`,
            default: false,
        }]);
        if (!ok) { console.log(chalk.gray('キャンセルしました。')); return; }
    }

    // ソース取得
    const srcRef = await resolveAppRef(appName, { env: fromEnv, profile: options.profile });
    if (!srcRef) return;

    console.log(chalk.gray(`fetching LIVE layout from ${srcRef.label} (app ${srcRef.appId})...`));
    let layout: any[];
    try {
        const resp = await srcRef.client.app.getFormLayout({ app: srcRef.appId, preview: true } as any);
        layout = (resp as any).layout;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to fetch layout: ${msg}`));
        return;
    }

    // ターゲット書き込み
    const dstRef = await resolveAppRef(appName, { env: toEnv, profile: options.profile });
    if (!dstRef) return;

    const revisionRaw = await fetchLiveRevision(dstRef.client, dstRef.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) { console.error(chalk.red(`✗ ${revisionCheck.error}`)); return; }

    try {
        await dstRef.client.app.updateFormLayout({
            app: dstRef.appId,
            layout,
            revision: revisionCheck.revision,
        } as any);
        console.log(chalk.green(`✔ layout synced ${fromEnv} → ${toEnv} (app ${dstRef.appId}). deploy で本番反映できます。`));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ sync-layout failed: ${msg}`));
    }
}
