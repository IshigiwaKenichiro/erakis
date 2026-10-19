import { program } from 'commander';
import chalk from 'chalk';
import inq from 'inquirer';
import { ProfileStorage, profFilePath } from '../storage/ProfileStorage.js';
import type { Profile } from '../models.js';
import _ from 'lodash';


export function profileCommand() {
    const sub = program.command('profile')
        .description('manage kintone profiles on your environment.')

    sub.command('add')
        .option('-n, --name <name>', 'name of the profile to add.')
        .option('--base-url <url>', 'kintone base URL')
        .option('--username <username>', 'login username')
        .option('--password <password>', 'login password (left in shell history; prefer the prompt or ERAKIS_PASSWORD)')
        .option('--basic-username <username>', 'basic auth username')
        .option('--basic-password <password>', 'basic auth password (left in shell history; prefer the prompt or ERAKIS_BASIC_PASSWORD)')
        .description('add a profile of a given name.')
        .action(add);

    sub.command('update')
        .argument('name')
        .option('--base-url <url>', 'kintone base URL')
        .option('--username <username>', 'login username')
        .option('--password <password>', 'login password (left in shell history; prefer the prompt or ERAKIS_PASSWORD)')
        .option('--basic-username <username>', 'basic auth username')
        .option('--basic-password <password>', 'basic auth password (left in shell history; prefer the prompt or ERAKIS_BASIC_PASSWORD)')
        .description('update a profile of a given name.')
        .action(update);


    sub.command('remove')
        .argument('name')
        .description('remove a profile of a given name.')
        .action(remove);

    sub.command('list')
        .description('list all profiles.')
        .action(list);

}

type PromptDefaults = Partial<Omit<Profile, 'name'>>;

// 既存の値は画面に出さない。空のまま Enter なら今の値を使う
const KEEP_CURRENT = ' (leave empty to keep current)';

async function promptData(def: PromptDefaults) {
    const hasPassword = !_.isEmpty(def.password);
    const hasBasicPassword = !_.isEmpty(def.basicPassword);

    const answers = await inq.prompt([
        {
            name: 'baseUrl',
            default: def.baseUrl ?? '',
            message: `input base-url (like https://xxx.cybozu.com)`,
            type: 'input',
            validate: (input) => {
                return _.isEmpty(input) ? false : true
            }
        },
        {
            name: 'username',
            default: def.username ?? '',
            message: 'your username',
            type: 'input',
            validate: (input) => {
                return _.isEmpty(input) ? false : true
            }
        },
        {
            name: 'password',
            message: `your password${hasPassword ? KEEP_CURRENT : ''}`,
            type: 'password',
            mask: '*',
            validate: (input) => {
                return hasPassword || !_.isEmpty(input)
            }
        },
        {
            name: 'basicUsername',
            default: def.basicUsername ?? '',
            message: 'your basic username (not required)',
            type: 'input',
        },
        {
            name: 'basicPassword',
            message: `your basic password (not required)${hasBasicPassword ? KEEP_CURRENT : ''}`,
            type: 'password',
            mask: '*',
        }
    ]);

    return {
        baseUrl: answers.baseUrl as string,
        username: answers.username as string,
        password: (answers.password || def.password || '') as string,
        basicUsername: (answers.basicUsername ?? '') as string,
        basicPassword: (answers.basicPassword || def.basicPassword || '') as string,
    }
}


type AddOptions = {
    name?: string;
    baseUrl?: string;
    username?: string;
    password?: string;
    basicUsername?: string;
    basicPassword?: string;
}

async function add(options: AddOptions) {

    let name: string = options.name ?? '';

    if (_.isEmpty(name)) {
        name = (await inq.prompt({
            name: 'name',
            type: 'input',
            message: 'input name of the profile.'
        })).name;
    }


    console.log(chalk.cyan(`adding profile of ${name}`));

    const storage = new ProfileStorage();

    const _json = storage.getData();

    if (_json.profiles[name] != null) {
        console.error(`profile ${name} already exists.`);
        return;
    }

    // CLIオプション > 環境変数 > 対話プロンプト の優先順位で解決
    const baseUrl = options.baseUrl ?? process.env.ERAKIS_BASE_URL ?? '';
    const username = options.username ?? process.env.ERAKIS_USERNAME ?? '';
    const password = options.password ?? process.env.ERAKIS_PASSWORD ?? '';
    const basicUsername = options.basicUsername ?? process.env.ERAKIS_BASIC_USERNAME ?? '';
    const basicPassword = options.basicPassword ?? process.env.ERAKIS_BASIC_PASSWORD ?? '';

    let result;
    if (!_.isEmpty(baseUrl) && !_.isEmpty(username) && !_.isEmpty(password)) {
        // 必須3項目が全て揃っていればpromptスキップ
        result = { baseUrl, username, password, basicUsername, basicPassword };
    } else {
        result = await promptData({ baseUrl, username, password, basicUsername, basicPassword });
    }

    if (!save(storage, { name, ...result })) return;

    console.log(`profile ${name} created.`);

}

type UpdateOptions = {
    baseUrl?: string;
    username?: string;
    password?: string;
    basicUsername?: string;
    basicPassword?: string;
}

async function update(name: string, options: UpdateOptions) {
    console.log(chalk.cyan(`updating profile of ${name}`));

    const storage = new ProfileStorage();

    const _json = storage.getData();

    if (_json.profiles[name] == null) {
        console.error(`profile ${name} not found.`);
        return;
    }

    const existing = _json.profiles[name];

    // CLIオプション > 既存値
    const baseUrl = options.baseUrl ?? existing.baseUrl;
    const username = options.username ?? existing.username;
    const password = options.password ?? existing.password;
    const basicUsername = options.basicUsername ?? existing.basicUsername;
    const basicPassword = options.basicPassword ?? existing.basicPassword;

    let result;
    if (options.baseUrl && options.username && options.password) {
        // 必須3項目がCLI指定されていればpromptスキップ
        result = { baseUrl, username, password, basicUsername, basicPassword };
    } else if (options.baseUrl || options.username || options.password
        || options.basicUsername || options.basicPassword) {
        // 部分指定の場合はオプション値+既存値をdefaultにしてprompt
        result = await promptData({ baseUrl, username, password, basicUsername, basicPassword });
    } else {
        // オプション未指定時は従来通り
        result = await promptData(existing);
    }

    if (!save(storage, { name, ...result })) return;

    console.log(`profile ${name} updated.`);
}


function save(storage: ProfileStorage, profile: Profile): boolean {
    try {
        storage.saveProfile(profile);
        return true;
    } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
        return false;
    }
}

// 画面やログ・AI のコンテキストに残さないよう、有無だけを見せる
function maskSecret(secret: string): string {
    return _.isEmpty(secret) ? '(not set)' : '********';
}

async function remove(name: string) {
    console.log(chalk.cyan(`removing profile of ${name}`));

    const storage = new ProfileStorage();

    const _json = storage.getData();

    if (_json.profiles[name] == null) {
        console.error(`profile ${name} not found.`);
        return;
    }

    storage.removeProfile(name);

    console.log(`profile ${name} removed.`);
}

async function list() {

    const storage = new ProfileStorage();
    const json = storage.getData();

    const { profiles } = json;

    Object.values(profiles).forEach(profile => {
        console.log(`
profile ${chalk.blue(profile.name)}
    base-url : ${chalk.red(profile.baseUrl)}
    username : ${chalk.green(profile.username)}
    password : ${chalk.green(maskSecret(profile.password))}
    basicUsername : ${chalk.yellow(profile.basicUsername)}
    basicPassword : ${chalk.yellow(maskSecret(profile.basicPassword))}
            `.trim())
    });

    if (0 == Object.values(profiles).length) {
        console.log(chalk.red('no data.'));
    }

    console.log(`profile saved at ${chalk.yellow(profFilePath)} (passwords are kept in the OS credential store)`)
}

