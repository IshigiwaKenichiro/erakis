import chalk from 'chalk';
import inq from 'inquirer';
import { profileStorage } from '../_shared/helpers.js';
import { createKintoneClient } from '../../utils/kintoneClient.js';
/**
 * spaceRef 文字列を単一の数値 ID に解析する純粋関数。
 * 省略・空文字は { id: undefined }。スラッシュ形式・非数値は null を返す。
 */
export function parseSpaceRef(arg) {
    if (arg === undefined || arg === '') {
        return { id: undefined };
    }
    if (/^\d+$/.test(arg)) {
        return { id: arg };
    }
    return null;
}
/**
 * create コマンド用プロファイル解決純粋関数。
 * 優先順位: 1. 明示的な --profile, 2. プロファイルが1件のみ, 3. エラー。
 */
export function resolveProfileForCreate(allProfileNames, profileHint) {
    if (profileHint) {
        if (!allProfileNames.includes(profileHint)) {
            return { error: `profile "${profileHint}" not found.` };
        }
        return { profileName: profileHint };
    }
    if (allProfileNames.length === 0)
        return { error: 'no profiles found. run `erakis profile add` first.' };
    if (allProfileNames.length === 1)
        return { profileName: allProfileNames[0] };
    return { error: 'multiple profiles found. specify --profile <name>.' };
}
/**
 * `erakis schema create` — 空の kintone アプリを作成する。
 * --guest-space を付けるとゲストスペース用エンドポイントを使用する。
 * .erakis/apps.json への登録は行わない。作成後は app register / app connect を使うこと。
 */
export async function schemaCreate(spaceIdOrGuestSpaceId, options) {
    const parsed = parseSpaceRef(spaceIdOrGuestSpaceId);
    if (parsed === null) {
        console.error(chalk.red(`invalid ID "${spaceIdOrGuestSpaceId}". expected a single numeric space or guest-space ID.`));
        return;
    }
    const { profiles } = profileStorage.getData();
    const profileResult = resolveProfileForCreate(Object.keys(profiles), options.profile);
    if ('error' in profileResult) {
        console.error(chalk.red(profileResult.error));
        return;
    }
    const profile = profiles[profileResult.profileName];
    if (!profile) {
        console.error(chalk.red(`profile "${profileResult.profileName}" not found.`));
        return;
    }
    if (!options.yes) {
        const parts = [
            `profile: ${profileResult.profileName}`,
            parsed.id ? `space ID: ${parsed.id}` : 'no space',
            parsed.id && options.guestSpace ? 'guest-space' : null,
        ].filter(Boolean).join(', ');
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: `Create an empty kintone app? (${parts})`,
            }]);
        if (!ok)
            return console.log(chalk.red('quit.'));
    }
    // --guest-space が指定されたときのみ guestSpaceId をクライアントに渡す。
    // guestSpaceId を渡すと /k/guest/<id>/v1/... エンドポイントを使用するため、
    // 通常スペースには渡してはならない。
    const guestSpaceId = parsed.id && options.guestSpace ? parsed.id : undefined;
    const client = createKintoneClient(profile, { guestSpaceId });
    const params = { name: 'erakis app' };
    if (parsed.id)
        params.space = Number(parsed.id);
    const result = await client.app.addApp(params);
    console.log(chalk.green(`created. app: ${result.app}, revision: ${result.revision}`));
}
