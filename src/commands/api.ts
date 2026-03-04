import { program } from 'commander';
import chalk from 'chalk';
import _ from 'lodash';
import { ApiStorage, apiFilePath } from '../storage/ApiStorage.js';
import { ProfileStorage } from '../storage/ProfileStorage.js';
import type { ApiTarget, ResolvedTarget } from '../models.js';
import { generateApi } from '../gen/apiGenerator.js';

const apiStorage = new ApiStorage();
const profileStorage = new ProfileStorage();

type GenOptions = {
    app?: string[];
    profile?: string;
    out?: string;
    dryRun?: boolean;
    clean?: boolean;
    prettier?: boolean;
    verbose?: boolean;
};

type RemoveOptions = {
    alias?: string;
};

export function apiCommand() {
    const sub = program
        .command('api')
        .description('manage low-level API generation for kintone apps.');

    sub.command('gen')
        .description('generate typed low-level API for kintone apps.')
        .option('--app <appId:alias>', 'target app(s) in appId:alias format (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
        .option('--profile <name>', 'kintone profile for schema retrieval')
        .option('--out <dir>', 'output directory')
        .option('--dry-run', 'show what would be generated without writing files')
        .option('--clean', 'remove @generated files not in current generation')
        .option('--prettier', 'format generated files with prettier (default: true)')
        .option('--no-prettier', 'skip prettier formatting')
        .option('--verbose', 'verbose output')
        .action(gen);

    sub.command('remove')
        .description('remove a registered API target.')
        .requiredOption('--alias <name>', 'alias of the target to remove')
        .action(remove);
}

/**
 * --app <appId:alias> をパースしてバリデーション
 */
function parseAppArgs(appArgs: string[]): { targets: { appId: string; alias: string }[]; errors: string[] } {
    const targets: { appId: string; alias: string }[] = [];
    const errors: string[] = [];
    const seenAliases = new Set<string>();

    for (const arg of appArgs) {
        const parts = arg.split(':');
        if (parts.length !== 2 || _.isEmpty(parts[0]) || _.isEmpty(parts[1])) {
            errors.push(`invalid format "${arg}". expected <appId:alias> (e.g. 1:master)`);
            continue;
        }

        const [appId, alias] = parts;

        if (isNaN(Number(appId))) {
            errors.push(`appId "${appId}" is not a number in "${arg}"`);
            continue;
        }

        if (seenAliases.has(alias)) {
            errors.push(`duplicate alias "${alias}"`);
            continue;
        }

        seenAliases.add(alias);
        targets.push({ appId, alias });
    }

    return { targets, errors };
}

/**
 * ターゲット一覧を表示
 */
function displayTargets(targets: ApiTarget[]) {
    console.log(chalk.cyan('Targets:'));

    if (targets.length === 0) {
        console.log(chalk.yellow('  (none)'));
        return;
    }

    // alias名の最大長でパディング
    const maxLen = Math.max(...targets.map(t => t.alias.length));

    for (const t of targets) {
        const padded = t.alias.padEnd(maxLen);
        const profile = t.profile ?? '(default)';
        if (t.enabled) {
            console.log(`  ${chalk.green(padded)}  (appId: ${t.appId}, profile: ${profile}) ${chalk.green('✓')}`);
        } else {
            console.log(`  ${chalk.gray(padded)}  (appId: ${t.appId}, profile: ${profile}) ${chalk.yellow('[disabled]')}`);
        }
    }
}

/**
 * 解決済みターゲット群の各profileが存在するかチェック
 * @returns 検証エラーがあればtrue
 */
function validateProfiles(resolved: ResolvedTarget[]): boolean {
    const { profiles } = profileStorage.getData();
    let hasError = false;

    for (const t of resolved) {
        if (!_.isEmpty(t.profile) && null == profiles[t.profile]) {
            console.error(chalk.red(`error: profile "${t.profile}" not found (target: ${t.alias}).`));
            hasError = true;
        }
    }

    return hasError;
}

async function gen(options: GenOptions) {
    // --app 指定がある場合: パース・バリデーション → 登録 → 生成
    if (options.app && options.app.length > 0) {
        const { targets: parsed, errors } = parseAppArgs(options.app);

        if (errors.length > 0) {
            for (const err of errors) {
                console.error(chalk.red(`error: ${err}`));
            }
            process.exitCode = 1;
            return;
        }

        // api.jsonにターゲットを登録（upsert）
        // まず解決済みprofileを取得して登録用に使う
        const config = apiStorage.getData();
        const cliProfile = options.profile
            ?? config.defaults.profile
            ?? process.env.ERAKIS_PROFILE
            ?? '';

        for (const t of parsed) {
            const target: ApiTarget = {
                alias: t.alias,
                appId: t.appId,
                profile: !_.isEmpty(cliProfile) ? cliProfile : undefined,
                enabled: true,
            };
            apiStorage.saveTarget(target);
            if (options.verbose) {
                console.log(chalk.gray(`registered: ${t.alias} (appId: ${t.appId})`));
            }
        }

        // outDir/profileのdefaultsを保存
        if (options.out) {
            apiStorage.setDefaultOutDir(options.out);
        }
        if (options.profile) {
            apiStorage.setDefaultProfile(options.profile);
        }

        console.log(chalk.green(`saved to ${apiFilePath}`));

        // getResolvedTargetsで解決済みターゲットを取得（今回指定分のみ）
        const filterAliases = parsed.map(p => p.alias);
        const resolved = apiStorage.getResolvedTargets(
            { profile: options.profile, out: options.out },
            filterAliases
        );

        // ターゲット一覧表示（全ターゲット）
        const freshConfig = apiStorage.getData();
        displayTargets(freshConfig.targets);

        // 各ターゲットのprofile存在チェック
        if (validateProfiles(resolved)) {
            process.exitCode = 1;
            return;
        }

        // 生成エンジン実行
        const { profiles } = profileStorage.getData();
        const result = await generateApi({
            targets: resolved,
            profiles,
            options: {
                dryRun: options.dryRun ?? false,
                clean: options.clean ?? false,
                prettier: options.prettier ?? true,
                verbose: options.verbose ?? false,
            },
        });

        if (!result.success) {
            for (const err of result.errors) {
                console.error(chalk.red(`error: ${err}`));
            }
            process.exitCode = 1;
            return;
        }

        console.log(chalk.cyan(`\ngenerated: ${result.generated} app(s)`));
        return;
    }

    // --app 未指定: api.jsonから全ターゲットを再生成
    if (!apiStorage.exists()) {
        console.error(chalk.red('error: no api.json found. register targets first with --app <appId:alias>.'));
        process.exitCode = 1;
        return;
    }

    // getResolvedTargetsで全enabledターゲットを解決
    const resolved = apiStorage.getResolvedTargets(
        { profile: options.profile, out: options.out }
    );

    if (resolved.length === 0) {
        console.error(chalk.red('error: no enabled targets found in api.json.'));
        process.exitCode = 1;
        return;
    }

    // 各ターゲットのprofile存在チェック
    if (validateProfiles(resolved)) {
        process.exitCode = 1;
        return;
    }

    // ターゲット一覧表示（全ターゲット、disabled含む）
    const config = apiStorage.getData();
    displayTargets(config.targets);

    // 生成エンジン実行
    const { profiles } = profileStorage.getData();
    const result = await generateApi({
        targets: resolved,
        profiles,
        options: {
            dryRun: options.dryRun ?? false,
            clean: options.clean ?? false,
            prettier: options.prettier ?? true,
            verbose: options.verbose ?? false,
        },
    });

    if (!result.success) {
        for (const err of result.errors) {
            console.error(chalk.red(`error: ${err}`));
        }
        process.exitCode = 1;
        return;
    }

    console.log(chalk.cyan(`\ngenerated: ${result.generated} app(s)`));
}

async function remove(options: RemoveOptions) {
    const alias = options.alias ?? '';

    if (_.isEmpty(alias)) {
        console.error(chalk.red('error: --alias is required.'));
        process.exitCode = 1;
        return;
    }

    const removed = apiStorage.removeTarget(alias);

    if (removed) {
        console.log(chalk.green(`target "${alias}" removed.`));
    } else {
        console.error(chalk.red(`error: target "${alias}" not found.`));
        process.exitCode = 1;
    }
}
