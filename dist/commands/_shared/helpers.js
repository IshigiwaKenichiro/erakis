import chalk from 'chalk';
import inq from 'inquirer';
import { ProfileStorage } from '../../storage/ProfileStorage.js';
import { AppStorage } from '../../storage/AppStorage.js';
/** Module-level singletons shared across all app command modules. */
export const profileStorage = new ProfileStorage();
export const appStorage = new AppStorage();
/**
 * kintoneアプリURLを appId と guestSpaceId に分解する。
 * 失敗時は errors 配列が空でない状態で返る。
 * @param urlstr  - kintoneアプリの完全URL
 * @param profile - baseUrl が urlstr のプレフィックスと一致するプロファイル
 */
export function url2ids(urlstr, profile) {
    const ret = {
        errors: [], appId: '', guestSpaceId: ''
    };
    const url = new URL(urlstr);
    if (!urlstr.includes(profile.baseUrl)) {
        ret.errors.push('url has no valid domain');
        return ret;
    }
    const paths = url.pathname.split('/');
    const idx = paths.findIndex(item => item == 'guest');
    if (idx >= 0) {
        ret.guestSpaceId = paths[idx + 1];
        ret.appId = paths[idx + 2];
    }
    else {
        const kIdx = paths.findIndex(item => item == 'k');
        ret.appId = paths[kIdx + 1];
    }
    return ret;
}
/**
 * インタラクティブプロンプト: プロファイルを選択してアプリURLを入力する。
 * App オブジェクト (profileName, appId, guestSpaceId, baseUrl) を返す。
 * kintone API 呼び出しなし。
 */
export async function promptEnv() {
    const { profiles } = profileStorage.getData();
    const { profileName } = await inq.prompt([
        {
            name: "profileName",
            message: 'choose access profile.',
            type: 'list',
            choices: Object.values(profiles).map(profile => profile.name),
        }
    ]);
    const { appUrl } = await inq.prompt([
        {
            name: 'appUrl',
            message: `give me your app url!`,
            type: 'input',
            validate: (input) => {
                const { errors } = url2ids(input, profiles[profileName]);
                if (0 < errors.length)
                    return errors.join(',');
                return true;
            }
        }
    ]);
    const profile = profiles[profileName];
    const { appId, guestSpaceId } = url2ids(appUrl, profile);
    return { profileName: profile.name, appId, guestSpaceId, status: 'local', baseUrl: profile.baseUrl };
}
/**
 * kintoneアプリのブラウザURLを生成する。
 * guestSpaceId がある場合はゲストスペースURL形式、ない場合は標準の /k/<appId> 形式を返す。
 */
export function application2url(application) {
    const { profiles } = profileStorage.getData();
    const profile = profiles[application.profileName];
    if (!application.guestSpaceId) {
        return `${profile.baseUrl}/k/${application.appId}`;
    }
    return `${profile.baseUrl}/k/guest/${application.guestSpaceId}/${application.appId}`;
}
/**
 * アプリのデプロイステータスに対応する chalk カラー関数を返す純粋関数。
 * local → green, fixed → yellow, released → cyan, その他 → red。
 */
export function getChalk(app) {
    switch (app.status) {
        case 'local': return chalk.green;
        case 'fixed': return chalk.yellow;
        case 'released': return chalk.cyan;
        default: return chalk.red;
    }
}
/**
 * CLIオプション文字列からインタラクティブプロンプトなしで App を生成する。
 * プロファイルが存在しない、またはURLが無効な場合は null を返してエラーを出力する。
 * kintone API 呼び出しなし。
 */
export function resolveEnvFromOptions(profileName, appUrl) {
    const { profiles } = profileStorage.getData();
    const profile = profiles[profileName];
    if (null == profile) {
        console.error(chalk.red(`profile "${profileName}" not found.`));
        return null;
    }
    try {
        const { errors, appId, guestSpaceId } = url2ids(appUrl, profile);
        if (0 < errors.length) {
            console.error(chalk.red(`invalid url: ${errors.join(', ')}`));
            return null;
        }
        return { profileName: profile.name, appId, guestSpaceId, status: 'local', baseUrl: profile.baseUrl };
    }
    catch (e) {
        console.error(chalk.red(`invalid url format: ${appUrl}`));
        return null;
    }
}
/**
 * 操作対象のアプリ名リストを解決する。
 * --app が指定された場合は存在確認のうえ1要素の配列を返す。
 * 省略時は接続済み全アプリを返す。
 * エラー時は null を返してメッセージを出力する。
 */
export function resolveTargetApps(customizations, appOption) {
    if (appOption) {
        if (null == customizations[appOption]) {
            console.error(chalk.red(`application "${appOption}" not found.`));
            return null;
        }
        return [appOption];
    }
    const all = Object.keys(customizations);
    if (all.length === 0) {
        console.error(chalk.red('no apps connected. run `erakis app connect` first.'));
        return null;
    }
    return all;
}
/**
 * Windows ファイル名に使える安全なスナップショット ID 文字列を生成する。
 * 形式: YYYY-MM-DDTHH-mm-ss+-HH-mm（コロンをハイフンで代替してファイルシステム互換にする）
 */
export function makeSnapshotId() {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const oh = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const om = String(absOffset % 60).padStart(2, '0');
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const D = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D}T${h}-${m}-${s}${sign}${oh}-${om}`;
}
