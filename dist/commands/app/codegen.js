import chalk from 'chalk';
import inq from 'inquirer';
import _ from 'lodash';
import { appStorage } from './_helpers.js';
import { isCustomizationApp } from '../../utils/_getTargets.js';
import { prepareIndex, prepareTemplate, prepareTest } from '../../utils/_prepareTemplate.js';
/**
 * `erakis app codegen` — カスタマイズアプリのテンプレートソースファイルを再生成する。
 * src/app/<name> が存在するカスタマイズアプリのみ対象。
 * 登録専用アプリは先に `erakis app connect` でカスタマイズをセットアップする必要がある。
 * kintone API への読み書きなし — ローカルファイルのみ書き出す。
 * --app 省略時はインタラクティブにアプリを選択する。
 */
export async function codegen(options) {
    const { customizations } = appStorage.getData();
    // カスタマイズアプリのみ対象
    const customizationAppNames = Object.keys(customizations).filter(isCustomizationApp);
    let applicationName = options.app ?? '';
    if (_.isEmpty(applicationName)) {
        if (0 == customizationAppNames.length) {
            console.error(chalk.red('No customization apps found. Use "erakis app connect" to set up customization first.'));
            return;
        }
        applicationName = (await inq.prompt([{
                name: 'applicationName',
                type: 'list',
                choices: customizationAppNames,
                message: 'choose your application.'
            }])).applicationName;
    }
    else if (null == customizations[applicationName]) {
        console.error(chalk.red(`application "${applicationName}" not found.`));
        return;
    }
    else if (!isCustomizationApp(applicationName)) {
        console.error(chalk.red(`"${applicationName}" is a register-only app. Use "erakis app connect" to set up customization source files first.`));
        return;
    }
    prepareTemplate(applicationName);
    prepareTest();
    prepareIndex(true);
    console.log(chalk.green('success to regenerate code files. GoodLuck :D'));
}
