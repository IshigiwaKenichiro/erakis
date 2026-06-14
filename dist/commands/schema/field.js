import chalk from 'chalk';
import inq from 'inquirer';
import fs from 'fs-extra';
import { resolveAppRef, fetchLiveRevision, checkRevisionResult, resolveFilePath } from './_helpers.js';
// ---------------------------------------------------------------------------
// 純粋関数
// ---------------------------------------------------------------------------
/**
 * ファイルや標準入力由来の JSON を properties オブジェクトに正規化する純粋関数。
 * get-field が出力する { properties: {...} } 形式と素のマップ { "fieldCode": {...} } の両方を受け付ける。
 *
 * 優先規則: raw.properties がオブジェクト（かつ配列でない）ならラッパー形式とみなす。
 * これにより get-field → (編集) → create-field/update-field のラウンドトリップが成立する。
 *
 * 曖昧ケースの注記: "properties" という名前のフィールドを含む素のマップを渡した場合、
 * raw.properties がオブジェクトと判定されラッパーとして扱われる。
 * get-field 出力（ラッパー形式）を正しく処理するためこの規則を優先する。
 */
export function parseFieldsInput(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { error: 'invalid fields format: expected object or { properties: {...} }' };
    }
    const obj = raw;
    // ラッパー形式: { properties: { ... } }
    if ('properties' in obj && obj.properties !== null && typeof obj.properties === 'object' && !Array.isArray(obj.properties)) {
        return obj.properties;
    }
    // 素のマップ形式: { "fieldCode": {...}, ... }
    return obj;
}
// ---------------------------------------------------------------------------
// コマンド実装
// ---------------------------------------------------------------------------
/**
 * `erakis schema get-field <appRef> [filePath]`
 * preview のフィールド定義を取得する。filePath 省略時は標準出力（パイプ互換のため装飾なし）。
 * 出力形式は { properties: {...} }（getFormFields レスポンスラッパー）。
 * この出力を無編集で create-field/update-field に渡せる（ラウンドトリップ保証）。
 * LIVE preview 読み取り専用。
 */
export async function schemaGetField(appRef, filePath, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema get-field phase3test'));
        console.error(chalk.gray('  example: erakis schema get-field phase3test -e prod'));
        console.error(chalk.gray('  example: erakis schema get-field 463'));
        return;
    }
    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref)
        return;
    try {
        const resp = await ref.client.app.getFormFields({ app: ref.appId, preview: true });
        const properties = resp.properties;
        const output = { properties };
        if (filePath) {
            const resolved = resolveFilePath(filePath);
            await fs.outputJSON(resolved, output, { spaces: 2 });
            console.error(chalk.green(`✔ fields を ${resolved} に書き出しました。`));
        }
        else {
            // 標準出力は純粋 JSON のみ（chalk 装飾なし。パイプで jq に渡せる形を保つ）
            process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to get fields: ${msg}`));
    }
}
/**
 * `erakis schema create-field <appRef> <filePath>`
 * filePath の JSON でフィールドを追加する（deploy しない）。
 * { properties: {...} } 形式と素のマップ {...} の両形式を受け付ける。
 * preview 書き込み - addFormFields。revision 楽観ロックあり。
 */
export async function schemaCreateField(appRef, filePath, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        return;
    }
    if (!filePath) {
        console.error(chalk.red('filePath is required.'));
        return;
    }
    const resolvedPath = resolveFilePath(filePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error(chalk.red(`file not found: ${resolvedPath}`));
        return;
    }
    let raw;
    try {
        raw = await fs.readJSON(resolvedPath);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to read ${resolvedPath}: ${msg}`));
        return;
    }
    const parsed = parseFieldsInput(raw);
    if ('error' in parsed) {
        console.error(chalk.red(parsed.error));
        return;
    }
    const properties = parsed;
    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref)
        return;
    const fieldCount = Object.keys(properties).length;
    console.log(chalk.gray(`adding ${fieldCount} field(s) to ${ref.label} (app ${ref.appId})`));
    if (!options.yes) {
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: `${fieldCount} 件のフィールドを追加しますか？`,
                default: false,
            }]);
        if (!ok) {
            console.log(chalk.gray('キャンセルしました。'));
            return;
        }
    }
    const revisionRaw = await fetchLiveRevision(ref.client, ref.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) {
        console.error(chalk.red(`✗ ${revisionCheck.error}`));
        return;
    }
    try {
        await ref.client.app.addFormFields({
            app: ref.appId,
            properties,
            revision: revisionCheck.revision,
        });
        console.log(chalk.green(`✔ fields added (app ${ref.appId}). deploy で本番反映できます。`));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ addFormFields failed: ${msg}`));
    }
}
/**
 * `erakis schema update-field <appRef> <filePath>`
 * filePath の JSON でフィールドを更新する（deploy しない）。
 * { properties: {...} } 形式と素のマップ {...} の両形式を受け付ける。
 * preview 書き込み - updateFormFields。revision 楽観ロックあり。
 */
export async function schemaUpdateField(appRef, filePath, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        return;
    }
    if (!filePath) {
        console.error(chalk.red('filePath is required.'));
        return;
    }
    const resolvedPath = resolveFilePath(filePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error(chalk.red(`file not found: ${resolvedPath}`));
        return;
    }
    let raw;
    try {
        raw = await fs.readJSON(resolvedPath);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to read ${resolvedPath}: ${msg}`));
        return;
    }
    const parsed = parseFieldsInput(raw);
    if ('error' in parsed) {
        console.error(chalk.red(parsed.error));
        return;
    }
    const properties = parsed;
    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref)
        return;
    const fieldCount = Object.keys(properties).length;
    console.log(chalk.gray(`updating ${fieldCount} field(s) in ${ref.label} (app ${ref.appId})`));
    if (!options.yes) {
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: `${fieldCount} 件のフィールドを更新しますか？`,
                default: false,
            }]);
        if (!ok) {
            console.log(chalk.gray('キャンセルしました。'));
            return;
        }
    }
    const revisionRaw = await fetchLiveRevision(ref.client, ref.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) {
        console.error(chalk.red(`✗ ${revisionCheck.error}`));
        return;
    }
    try {
        await ref.client.app.updateFormFields({
            app: ref.appId,
            properties,
            revision: revisionCheck.revision,
        });
        console.log(chalk.green(`✔ fields updated (app ${ref.appId}). deploy で本番反映できます。`));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ updateFormFields failed: ${msg}`));
    }
}
/**
 * `erakis schema delete-field <appRef> <fieldCodes...>`
 * 指定したフィールドコードを preview から削除する（deploy しない）。
 * 複数コード指定可。
 * ⚠ deploy するとフィールドのデータごと完全に削除される。この操作は取り消せない。
 * preview 書き込み - deleteFormFields。revision 楽観ロックあり。
 */
export async function schemaDeleteField(appRef, fieldCodes, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        return;
    }
    if (!fieldCodes || fieldCodes.length === 0) {
        console.error(chalk.red('at least one fieldCode is required.'));
        console.error(chalk.gray('  example: erakis schema delete-field phase3test myField'));
        console.error(chalk.gray('  example: erakis schema delete-field phase3test field1 field2'));
        return;
    }
    const ref = await resolveAppRef(appRef, { env: options.env, profile: options.profile });
    if (!ref)
        return;
    console.log(chalk.red(`⚠  削除対象: ${fieldCodes.join(', ')} (app ${ref.appId})`));
    console.log(chalk.red('⚠  deploy するとフィールドのデータごと完全に削除されます。この操作は取り消せません。'));
    if (!options.yes) {
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: `${fieldCodes.length} 件のフィールドを削除しますか？`,
                default: false,
            }]);
        if (!ok) {
            console.log(chalk.gray('キャンセルしました。'));
            return;
        }
    }
    const revisionRaw = await fetchLiveRevision(ref.client, ref.appId);
    const revisionCheck = checkRevisionResult(revisionRaw);
    if (!revisionCheck.ok) {
        console.error(chalk.red(`✗ ${revisionCheck.error}`));
        return;
    }
    try {
        await ref.client.app.deleteFormFields({
            app: ref.appId,
            fields: fieldCodes,
            revision: revisionCheck.revision,
        });
        console.log(chalk.green(`✔ fields deleted (app ${ref.appId}). deploy で本番反映できます。`));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`✗ deleteFormFields failed: ${msg}`));
    }
}
