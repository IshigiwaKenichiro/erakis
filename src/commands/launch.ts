import chalk from 'chalk';
import { Option, program } from 'commander';
import inq, { Answers } from 'inquirer';
import { AppStorage } from '../storage/AppStorage.js';
import { ProfileStorage } from '../storage/ProfileStorage.js';
import { mergeCustomize } from '../utils/_mergeCustomize.js';
import { isCustomizationApp } from '../utils/_getTargets.js';
import { createKintoneClient } from '../utils/kintoneClient.js';
import { checkSchemaDivergence, formatLaunchSchemaWarning, DivergenceState } from '../utils/schemaWriter.js';
const appStorage = new AppStorage();
const profileStorage = new ProfileStorage();

type AllOptions = {
    env: 'dev' | 'prod';
    status: 'local' | 'fixed' | 'released';
    yes?: boolean;
}

type AppOptions = {
    app: string;
    env: 'dev' | 'prod';
    status: 'local' | 'fixed' | 'released';
}

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

async function all(options: AllOptions) {

    if (!options.yes) {
        const {ok} = await inq.prompt({
            type : 'confirm',
            name : 'ok',
            message : `You are going to launch ${chalk.yellow('all')} applications to be a ${chalk.red("same status")}.`
        })

        if(!ok) return;
    }

    const prompts: Answers[] = [];

    if (null == options.env) prompts.push({
        name: 'env',
        type: 'list',
        choices: ['dev', 'prod'],
        message: 'Choose environment.'
    });

    if (null == options.status) prompts.push({
        name: 'status',
        type: 'list',
        choices: ['local', 'fixed', 'released'],
        message: 'Choose deploy type.'
    })

    const result = await inq.prompt(prompts);
    const env = options.env ?? result.env;
    const status = options.status ?? result.status;

    const { customizations } = appStorage.getData();

    // register-only apps are skipped; only customization apps are launched
    const customizationApps = Object.values(customizations).filter(c => isCustomizationApp(c.appName));
    const skipped = Object.values(customizations).filter(c => !isCustomizationApp(c.appName));
    for (const c of skipped) {
        console.log(chalk.yellow(`skipping ${c.appName}: register-only app (no customization source files).`));
    }

    if (0 == customizationApps.length) {
        console.log('No customization apps to launch.');
        return;
    }

    // 未 deploy 変更の警告チェック
    const customizationMap = Object.fromEntries(customizationApps.map(c => [c.appName, c]));
    await warnUndeployedChanges(customizationMap, env);

    for (let custom of customizationApps) {
        const app = 'dev' == env ? custom.development : custom.production;
        app.status = status;
        console.log(chalk.green(`${custom.appName} is launching as ${status}...`));
        await mergeCustomize(custom.appName, app);
        console.log(chalk.green(`${custom.appName} is launch as ${status}`));
        appStorage.saveCustomization(custom);
    }

    console.log(chalk.green(`All application was launched successfully. GoodLuck!`));
}

async function app(options: AppOptions) {
    const { customizations } = appStorage.getData();

    // interactive choices limited to customization apps only
    const customizationAppNames = Object.keys(customizations).filter(isCustomizationApp);

    const prompts: Answers[] = [];

    if (null == options.app) {
        if (0 == customizationAppNames.length) {
            console.error(chalk.red('No customization apps found. Use "erakis app connect" to set up customization first.'));
            return;
        }
        prompts.push({
            name: 'app',
            type: 'list',
            choices: customizationAppNames,
            message: 'Choose application'
        });
    }

    if (null == options.env) prompts.push({
        name: 'env',
        type: 'list',
        choices: ['dev', 'prod'],
        message: 'Choose environment.'
    });

    if (null == options.status) prompts.push({
        name: 'status',
        type: 'list',
        choices: ['local', 'fixed', 'released'],
        message: 'Choose deploy type.'
    })


    const result = await inq.prompt(prompts);
    const env = options.env ?? result.env;
    const status = options.status ?? result.status;
    const appName = options.app ?? result.app;
    const custom = customizations[appName];

    if (null == custom) {
        console.error(chalk.red(`application "${appName}" not found.`));
        return;
    }

    if (!isCustomizationApp(appName)) {
        console.error(chalk.red(`"${appName}" is a register-only app and has no customization source files. Use "erakis app connect" to set up customization first.`));
        return;
    }

    // 未 deploy 変更の警告チェック（単一アプリ）
    await warnUndeployedChanges({ [appName]: custom }, env);

    const app = 'dev' == env ? custom.development : custom.production;

    app.status = status;

    console.log(`${custom.appName} is launching...`);
    await mergeCustomize(custom.appName, app);
    console.log(`${custom.appName} is launch as ${status}`);
    appStorage.saveCustomization(custom);

    console.log(chalk.green(`${appName} was launched successfully. GoodLuck!`));

}

/**
 * launch 前に preview/live スキーマを実比較し、差分・デプロイ状態を警告する。
 * launch 自体は止めない（警告のみ）。
 * PROCESSING/FAIL/CANCEL・フィールド/レイアウト/ビュー差分・fetch-failed をすべて表示する。
 */
async function warnUndeployedChanges(
    customizations: Record<string, { appName: string; development: any; production: any }>,
    env: string,
): Promise<void> {
    const { profiles } = profileStorage.getData();

    for (const custom of Object.values(customizations)) {
        const appEnv = env === 'dev' ? custom.development : custom.production;
        const profile = profiles[appEnv.profileName];
        if (!profile) {
            console.warn(chalk.yellow(`⚠  ${custom.appName}: プロファイル '${appEnv.profileName}' が見つかりません。スキーマチェックをスキップします。launch は継続します。`));
            continue;
        }

        try {
            const client = createKintoneClient(profile, { guestSpaceId: appEnv.guestSpaceId || undefined });
            const appId = String(appEnv.appId);

            // デプロイ状態を取得（PROCESSING/FAIL/CANCEL の確認）
            let deployStatus: string | null = null;
            try {
                const statusResp = await client.app.getDeployStatus({ apps: [appId] });
                const entry = ((statusResp as any).apps ?? []).find((a: any) => String(a.app) === appId);
                deployStatus = entry?.status ?? null;
            } catch {
                console.warn(chalk.yellow(`⚠  ${custom.appName}: デプロイ状態の取得に失敗しました。スキーマ差分のみ確認します。launch は継続します。`));
            }

            // PROCESSING 中はスキーマ比較をスキップ（比較結果が不定のため）
            let divergence: DivergenceState | undefined;
            if (deployStatus !== 'PROCESSING') {
                divergence = await checkSchemaDivergence(client, appId);
            }

            const warnings = formatLaunchSchemaWarning(custom.appName, deployStatus, divergence, env);
            if (warnings) {
                for (const w of warnings) {
                    console.warn(chalk.yellow(w.text));
                }
            }
        } catch {
            console.warn(chalk.yellow(`⚠  ${custom.appName}: スキーマチェック中にエラーが発生しました。launch は継続します。`));
        }
    }
}