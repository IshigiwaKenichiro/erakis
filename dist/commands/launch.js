import chalk from 'chalk';
import { Option, program } from 'commander';
import inq from 'inquirer';
import { AppStorage } from '../storage/AppStorage.js';
import { mergeCustomize } from '../utils/_mergeCustomize.js';
const appStorage = new AppStorage();
export function launchCommand() {
    const sub = program
        .command('launch')
        .description('Launch kintone application for each environments.');
    sub.command('all')
        .description('Launch all applications')
        .addOption(new Option('-e, --env <dev/prod>').choices(['dev', 'prod']))
        .addOption(new Option('-s, --status <local/fixed/released>', 'local: use dev server / fixed: deploy dev build (dist/) / released: deploy production build (build/)').choices(['local', 'fixed', 'released']))
        .option('-y, --yes', 'skip confirmation prompt')
        .action(all);
    sub.command('app')
        .description('Launch several applications')
        .option('-a, --app <name>', 'application name')
        .addOption(new Option('-e, --env <dev/prod>').choices(['dev', 'prod']))
        .addOption(new Option('-s, --status <local/fixed/released>', 'local: use dev server / fixed: deploy dev build (dist/) / released: deploy production build (build/)').choices(['local', 'fixed', 'released']))
        .action(app);
}
async function all(options) {
    if (!options.yes) {
        const { ok } = await inq.prompt({
            type: 'confirm',
            name: 'ok',
            message: `You are going to launch ${chalk.yellow('all')} applications to be a ${chalk.red("same status")}.`
        });
        if (!ok)
            return;
    }
    const prompts = [];
    if (null == options.env)
        prompts.push({
            name: 'env',
            type: 'list',
            choices: ['dev', 'prod'],
            message: 'Choose environment.'
        });
    if (null == options.status)
        prompts.push({
            name: 'status',
            type: 'list',
            choices: ['local', 'fixed', 'released'],
            message: 'Choose deploy type.'
        });
    const result = await inq.prompt(prompts);
    const env = options.env ?? result.env;
    const status = options.status ?? result.status;
    const { customizations } = appStorage.getData();
    for (let custom of Object.values(customizations)) {
        const app = 'dev' == env ? custom.development : custom.production;
        app.status = status;
        console.log(chalk.green(`${custom.appName} is launching as ${status}...`));
        await mergeCustomize(custom.appName, app);
        console.log(chalk.green(`${custom.appName} is launch as ${status}`));
        appStorage.saveCustomization(custom);
    }
    console.log(chalk.green(`All application was launched successfully. GoodLuck!`));
}
async function app(options) {
    const { customizations } = appStorage.getData();
    const prompts = [];
    if (null == options.app)
        prompts.push({
            name: 'app',
            type: 'list',
            choices: Object.keys(customizations),
            message: 'Choose application'
        });
    if (null == options.env)
        prompts.push({
            name: 'env',
            type: 'list',
            choices: ['dev', 'prod'],
            message: 'Choose environment.'
        });
    if (null == options.status)
        prompts.push({
            name: 'status',
            type: 'list',
            choices: ['local', 'fixed', 'released'],
            message: 'Choose deploy type.'
        });
    const result = await inq.prompt(prompts);
    const env = options.env ?? result.env;
    const status = options.status ?? result.status;
    const appName = options.app ?? result.app;
    const custom = customizations[appName];
    if (null == custom) {
        console.error(chalk.red(`application "${appName}" not found.`));
        return;
    }
    const app = 'dev' == env ? custom.development : custom.production;
    app.status = status;
    console.log(`${custom.appName} is launching...`);
    await mergeCustomize(custom.appName, app);
    console.log(`${custom.appName} is launch as ${status}`);
    appStorage.saveCustomization(custom);
    console.log(chalk.green(`${appName} was launched successfully. GoodLuck!`));
}
