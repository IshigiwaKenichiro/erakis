import chalk from 'chalk';
import inq from 'inquirer';
import { resolveAppRef } from './_helpers.js';
/** schema create で --name を省いたときのアプリ名 */
export const DEFAULT_APP_NAME = 'erakis app';
/** kintone のアプリ名の上限文字数 */
export const MAX_APP_NAME_LENGTH = 64;
/**
 * アプリ名が kintone の制約（1〜64文字）に収まっているかを調べる。
 * 問題があればエラーメッセージを、無ければ null を返す。
 */
export function validateAppName(name) {
    if (name.trim() === '')
        return 'app name must not be empty.';
    // サロゲートペアの文字を1文字として数えるため、コードポイント単位で数える
    const length = [...name].length;
    if (length > MAX_APP_NAME_LENGTH) {
        return `app name is too long (${length} characters). max is ${MAX_APP_NAME_LENGTH}.`;
    }
    return null;
}
/**
 * `erakis schema rename <appRef> <name>` — kintone のアプリ名を変える。
 * ほかの schema 系の書き込みと同じく preview に書くだけで、反映は `schema deploy` で行う。
 * LIVE getAppSettings 読み取り / updateAppSettings 書き込み。
 */
export async function schemaRename(appRef, name, options) {
    const nameError = validateAppName(name);
    if (nameError) {
        console.error(chalk.red(nameError));
        process.exitCode = 1;
        return;
    }
    const ref = await resolveAppRef(appRef, { profile: options.profile, env: options.env });
    if (!ref) {
        process.exitCode = 1;
        return;
    }
    try {
        const current = await ref.client.app.getAppSettings({ app: ref.appId, preview: true });
        if (current.name === name) {
            console.log(chalk.gray(`app ${ref.appId} (${ref.label}) is already named "${name}". nothing to do.`));
            return;
        }
        if (!options.yes) {
            const { ok } = await inq.prompt([{
                    type: 'confirm',
                    name: 'ok',
                    message: `Rename app ${ref.appId} (${ref.label}) from "${current.name}" to "${name}"? (preview)`,
                }]);
            if (!ok)
                return console.log(chalk.red('quit.'));
        }
        // 取得したときの revision を渡し、そのあいだに他の人が設定を変えていたら kintone に弾かせる
        const result = await ref.client.app.updateAppSettings({ app: ref.appId, name, revision: current.revision });
        console.log(chalk.green(`renamed in preview. revision: ${result.revision}`));
        const deployArgs = [
            appRef,
            options.env ? `-e ${options.env}` : '',
            options.profile ? `--profile ${options.profile}` : '',
        ].filter(Boolean).join(' ');
        console.log(chalk.gray(`  run "erakis schema deploy ${deployArgs}" to publish.`));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to rename app ${ref.appId}: ${msg}`));
        process.exitCode = 1;
    }
}
