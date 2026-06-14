import chalk from 'chalk';
import inq from 'inquirer';
import { appStorage, promptEnv, resolveEnvFromOptions } from './_helpers.js';
/**
 * `erakis app register` - kintoneアプリペアを .erakis/apps.json に登録する。
 * 4つのオプションがすべて揃っていない場合はインタラクティブに入力を促す。
 * kintone API 呼び出しなし、カスタマイズソース/テンプレートファイルも生成しない。
 * カスタマイズの雛形も欲しい場合は `erakis app connect` を使うこと。
 * ローカル設定のみ変更（読み取り専用）。
 */
export async function register(options) {
    if (null == options.name) {
        options.name = (await inq.prompt({
            name: 'name',
            type: 'input',
            message: `input name of this app.`
        })).name;
    }
    const applicationName = options.name;
    const appData = appStorage.getData();
    const existing = appData.customizations[applicationName];
    if (null != existing) {
        if (!options.yes) {
            const { ok } = await inq.prompt([{
                    type: 'confirm',
                    name: 'ok',
                    message: `${applicationName} is already registered. Are you sure you want to overwrite?`
                }]);
            if (!ok)
                return;
        }
    }
    if ((options.devProfile && !options.devUrl) || (!options.devProfile && options.devUrl)) {
        console.warn(chalk.yellow('warning: --dev-profile and --dev-url must be specified together. falling back to interactive prompt.'));
    }
    if ((options.prodProfile && !options.prodUrl) || (!options.prodProfile && options.prodUrl)) {
        console.warn(chalk.yellow('warning: --prod-profile and --prod-url must be specified together. falling back to interactive prompt.'));
    }
    let development;
    if (options.devProfile && options.devUrl) {
        const resolved = resolveEnvFromOptions(options.devProfile, options.devUrl);
        if (null == resolved)
            return;
        development = resolved;
    }
    else {
        console.log(`Tell me ${chalk.green('development')} app info.`);
        development = await promptEnv();
        console.log();
    }
    let production;
    if (options.prodProfile && options.prodUrl) {
        const resolved = resolveEnvFromOptions(options.prodProfile, options.prodUrl);
        if (null == resolved)
            return;
        production = resolved;
    }
    else {
        console.log(`Tell me ${chalk.red('production')} app info.`);
        production = await promptEnv();
        console.log();
    }
    if (!options.yes) {
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: 'Register this app?'
            }]);
        if (!ok)
            return console.log(chalk.red('quit.'));
    }
    appStorage.saveCustomization({
        appName: applicationName,
        development: {
            appId: development.appId,
            guestSpaceId: development.guestSpaceId,
            profileName: development.profileName,
            baseUrl: development.baseUrl,
            status: 'local'
        },
        production: {
            appId: production.appId,
            guestSpaceId: production.guestSpaceId,
            profileName: production.profileName,
            baseUrl: production.baseUrl,
            status: 'local'
        },
    });
    console.log(chalk.green(`success. ${applicationName} registered. (no customization files generated)`));
}
