import { program } from 'commander';
import chalk from 'chalk';
import inq from 'inquirer';
import { ProfileStorage, profFilePath } from '../storage/ProfileStorage.js';
import _ from 'lodash';
export function profileCommand() {
    const sub = program.command('profile')
        .description('manage kintone profiles on your environment.');
    sub.command('add')
        .option('-n --name', 'name of the profile to add.')
        .description('add a profile of a given name.')
        .action(add);
    sub.command('update')
        .argument('name')
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
async function promptData(def) {
    console.log(def);
    const { baseUrl, username, password, basicUsername, basicPassword } = await inq.prompt([
        {
            name: 'baseUrl',
            default: def.baseUrl ?? '',
            message: `input base-url (like https://xxx.cybozu.com)`,
            type: 'input',
            validate: (input) => {
                return _.isEmpty(input) ? false : true;
            }
        },
        {
            name: 'username',
            default: def.username ?? '',
            message: 'your username',
            type: 'input',
            validate: (input) => {
                return _.isEmpty(input) ? false : true;
            }
        },
        {
            name: 'password',
            default: def.password ?? '',
            message: 'your password',
            type: 'input',
            validate: (input) => {
                return _.isEmpty(input) ? false : true;
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
            default: def.basicPassword ?? '',
            message: 'your basic password (not required)',
            type: 'input',
        }
    ]);
    return {
        baseUrl,
        username,
        password,
        basicUsername,
        basicPassword
    };
}
async function add(options) {
    let name = options.name ?? '';
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
    const result = await promptData({});
    //@ts-ignore
    storage.saveProfile({
        name, ...result
    });
    console.log(`profile ${name} created.`);
}
async function update(name) {
    console.log(chalk.cyan(`updating profile of ${name}`));
    const storage = new ProfileStorage();
    const _json = storage.getData();
    if (_json.profiles[name] == null) {
        console.error(`profile ${name} not found.`);
        return;
    }
    const result = await promptData(_json.profiles[name]);
    //@ts-ignore
    storage.saveProfile({
        name, ...result
    });
    console.log(`profile ${name} updated.`);
}
async function remove(name) {
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
    password : ${chalk.green(profile.password)}
    basicUsername : ${chalk.yellow(profile.basicUsername)}
    basicPassword : ${chalk.yellow(profile.basicPassword)}
            `.trim());
    });
    if (0 == Object.values(profiles).length) {
        console.log(chalk.red('no data.'));
    }
    console.log(`profile saved at ${chalk.yellow(profFilePath)}`);
}
