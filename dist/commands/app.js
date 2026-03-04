import { program } from 'commander';
import chalk from 'chalk';
import inq from 'inquirer';
import { ProfileStorage } from '../storage/ProfileStorage.js';
import { AppStorage } from '../storage/AppStorage.js';
import { prepareIndex, prepareTemplate, prepareTest } from '../utils/_prepareTemplate.js';
import { exec } from '../utils/_exec.js';
import _ from 'lodash';
import { mergeCustomize } from '../utils/_mergeCustomize.js';
import Table from 'cli-table';
const profileStorage = new ProfileStorage();
const appStorage = new AppStorage();
export function appCommand() {
    const sub = program
        .command('app')
        .description('manage kintone customized app.');
    sub.command('status')
        .description('show all status of the application.')
        .action(status);
    sub.command('connect')
        .description('add/connect a kintone app to be customized.')
        .option('-n, --name <name>', 'name of the customization')
        .option('--dev-profile <profileName>', 'development profile name')
        .option('--prod-profile <profileName>', 'production profile name')
        .option('--dev-url <url>', 'development app URL')
        .option('--prod-url <url>', 'production app URL')
        .option('-y, --yes', 'skip confirmation prompts')
        .action(connect);
    sub.command('codegen')
        .description('regenerate code file on your application.')
        .option('-a, --app <name>', 'application name')
        .action(codegen);
    sub.command('open')
        .description('show kintone')
        .option('-a, --app <name>', 'application name')
        .action(open);
}
function url2ids(urlstr, profile) {
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
async function promptEnv() {
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
                if (0 < errors.length) {
                    return errors.join(',');
                }
                return true;
            }
        }
    ]);
    const profile = profiles[profileName];
    const { appId, guestSpaceId } = url2ids(appUrl, profile);
    const ret = { profileName: profile.name, appId, guestSpaceId, status: 'local', baseUrl: profile.baseUrl };
    return ret;
}
async function status() {
    const appData = appStorage.getData();
    const table = new Table({
        head: ['application_name', "development", "dev_state", "production", "prod_state"]
    });
    Object.values(appData.customizations).forEach(custom => {
        table.push([
            custom.appName,
            application2url(custom.development),
            getChalk(custom.development)(custom.development.status),
            application2url(custom.production),
            getChalk(custom.production)(custom.production.status)
        ]);
    });
    console.log(table.toString());
}
/**
 * CLIオプションからApp情報を構築する。
 * profileが存在しない or URL検証エラー時はnullを返す。
 */
function resolveEnvFromOptions(profileName, appUrl) {
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
async function connect(options) {
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
    // dev側: オプションが全指定ならpromptスキップ
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
    // prod側: オプションが全指定ならpromptスキップ
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
        if (!ok) {
            return console.log(chalk.red('quit.'));
        }
    }
    await mergeCustomize(applicationName, development);
    console.log('kintone customization success.');
    prepareTemplate(applicationName);
    prepareTest();
    prepareIndex(true);
    console.log('template files are prepared.');
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
async function codegen(options) {
    const { customizations } = appStorage.getData();
    let applicationName = options.app ?? '';
    if (_.isEmpty(applicationName)) {
        applicationName = (await inq.prompt([{
                name: 'applicationName',
                type: 'list',
                choices: Object.keys(customizations),
                message: 'choose your application.'
            }])).applicationName;
    }
    else if (null == customizations[applicationName]) {
        console.error(chalk.red(`application "${applicationName}" not found.`));
        return;
    }
    prepareTemplate(applicationName);
    prepareTest();
    prepareIndex(true);
    console.log(chalk.green('success to regenerate code files. GoodLuck :D'));
}
async function open(options) {
    const { customizations } = appStorage.getData();
    let appName = options.app ?? '';
    if (_.isEmpty(appName)) {
        appName = (await inq.prompt([{
                type: 'list',
                name: 'app',
                message: 'choose application.',
                choices: Object.values(customizations).map(c => c.appName)
            }])).app;
    }
    else if (null == customizations[appName]) {
        console.error(chalk.red(`application "${appName}" not found.`));
        return;
    }
    const application = customizations[appName];
    const url = application2url(application.development);
    exec(`start ${url}`);
}
function application2url(application) {
    const { profiles } = profileStorage.getData();
    const profile = profiles[application.profileName];
    if (_.isEmpty(application.guestSpaceId)) {
        return `${profile.baseUrl}/k/${application.appId}`;
    }
    else {
        return `${profile.baseUrl}/k/guest/${application.guestSpaceId}/${application.appId}`;
    }
}
function getChalk(app) {
    switch (app.status) {
        case 'local': return chalk.green;
        case 'fixed': return chalk.yellow;
        case 'released': return chalk.cyan;
        default: return chalk.red;
    }
}
