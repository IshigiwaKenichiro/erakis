import chalk from 'chalk';
import inq from 'inquirer';
import { appStorage, promptEnv, resolveEnvFromOptions } from './_helpers.js';
import { prepareIndex, prepareTemplate, prepareTest } from '../../utils/_prepareTemplate.js';
import { mergeCustomize } from '../../utils/_mergeCustomize.js';
/**
 * `erakis app connect` — kintoneアプリのカスタマイズエントリを登録または更新する。
 * --dev-profile/--dev-url/--prod-profile/--prod-url が全部揃っていない場合はインタラクティブに入力を促す。
 * .erakis/apps.json に書き込み、テンプレートソースファイルを生成する。
 * kintone API 呼び出しあり: mergeCustomize 経由で dev アプリのカスタマイズ設定を更新する。
 * kintone API 呼び出しやファイル生成が不要な場合は `erakis app register` を使うこと。
 */
export async function connect(options) {
    console.log('app');
    if (null == options.name) {
        options.name = (await inq.prompt({
            name: 'name',
            type: 'input',
            message: `input name of this customization.`
        })).name;
    }
    let applicationName = options.name;
    const appData = appStorage.getData();
    const customs = appData.customizations[applicationName];
    if (null != customs) {
        if (!options.yes) {
            const { ok } = await inq.prompt([{
                    type: 'confirm',
                    name: 'ok',
                    message: `${applicationName} is already connected. Are you sure you want to refresh all settings?`
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
        console.log(`Tell me ${chalk.green('development')} appData.`);
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
        console.log(`Tell me ${chalk.red('production')} appData.`);
        production = await promptEnv();
        console.log();
    }
    if (!options.yes) {
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: 'Are you sure you want to connect?'
            }]);
        if (!ok)
            return console.log(chalk.red('quit.'));
    }
    prepareTemplate(applicationName);
    prepareTest();
    prepareIndex(true);
    console.log('template files are prepared.');
    await mergeCustomize(applicationName, development);
    console.log('kintone customization updated.');
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
    console.log('success. application registered.');
    console.log(chalk.green(`happy coding =b`));
}
