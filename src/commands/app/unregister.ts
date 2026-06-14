import chalk from 'chalk';
import inq from 'inquirer';
import { appStorage } from './_helpers.js';

export type UnregisterOptions = {
    app?: string;
    yes?: boolean;
};

/**
 * `erakis app unregister` - .erakis/apps.json からアプリエントリを削除する。
 * src/app/<name>・スキーマスナップショット・docs・テンプレートは削除しない。
 * kintone API を呼び出さない。ローカル設定のみの操作。
 */
export async function unregister(options: UnregisterOptions) {
    if (!options.app) {
        console.error('--app <name> is required.');
        process.exit(1);
    }

    const appData = appStorage.getData();
    const existing = appData.customizations[options.app];

    if (null == existing) {
        console.log(`${options.app} is not registered.`);
        return;
    }

    if (!options.yes) {
        const { ok } = await inq.prompt([{
            type: 'confirm',
            name: 'ok',
            message: `Unregister ${options.app} from erakis management? Customization files and kintone settings will not be changed.`
        }]);
        if (!ok) return console.log(chalk.red('quit.'));
    }

    appStorage.removeCustomization(options.app);
    console.log(chalk.green(`success. ${options.app} unregistered. customization files were not removed.`));
}
