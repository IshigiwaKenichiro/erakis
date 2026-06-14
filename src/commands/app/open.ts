import chalk from 'chalk';
import inq from 'inquirer';
import _ from 'lodash';
import { spawnSync } from 'child_process';
import { appStorage, application2url } from './_helpers.js';

/**
 * プラットフォームに応じてデフォルトブラウザで URL を開く。
 * spawnSync の argv 配列渡しでシェルインジェクションを回避する。
 * Windows: cmd /c start "" <url>（空タイトルで URL の特殊文字問題を回避）
 * macOS:   open <url>
 * Linux:   xdg-open <url>
 */
function openBrowser(url: string): void {
    if (process.platform === 'win32') {
        spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'inherit' });
    } else if (process.platform === 'darwin') {
        spawnSync('open', [url], { stdio: 'inherit' });
    } else {
        spawnSync('xdg-open', [url], { stdio: 'inherit' });
    }
}

/**
 * `erakis app open` — デフォルトブラウザで開発用 kintone アプリ URL を開く。
 * 読み取り専用 — kintone API を呼び出さない。
 */
export async function open(options: { app?: string }) {
    const { customizations } = appStorage.getData();
    let appName = options.app ?? '';

    if (_.isEmpty(appName)) {
        appName = (await inq.prompt([{
            type: 'list',
            name: 'app',
            message: 'choose application.',
            choices: Object.values(customizations).map(c => c.appName)
        }])).app;
    } else if (null == customizations[appName]) {
        console.error(chalk.red(`application "${appName}" not found.`));
        return;
    }

    const application = customizations[appName];
    const url = application2url(application.development);
    openBrowser(url);
}
