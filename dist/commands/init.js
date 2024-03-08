import { program } from "commander";
import { AppStorage } from '../storage/AppStorage.js';
import { ProfileStorage } from '../storage/ProfileStorage.js';
import { ServerStorage } from '../storage/ServerStorage.js';
import { prepareIndex, prepareTest } from "../utils/_prepareTemplate.js";
import chalk from "chalk";
export function initCommand() {
    const sub = program.command('init');
    sub.description('Initialize this project for Erakis.');
    sub.action(init);
}
export function init() {
    console.log('Initializing...');
    new AppStorage();
    new ProfileStorage();
    new ServerStorage();
    prepareTest();
    prepareIndex(true);
    console.log('Initialization complete.');
    console.log(`Type ${chalk.magenta("npx erakis profile add <name-of-your-profile>")} to create profile.`);
    console.log(`Type ${chalk.cyan("npx erakis genkey")} to generate server certificate.(Needs mkcert.)`);
    console.log(`Type ${chalk.green("npx erakis app <name-for-your-app>")} to connect kintone Application.`);
    console.log(`Type ${chalk.blue("npx erakis start")} to start live development server.`);
    console.log(`Type ${chalk.cyan("npx erakis build")} to build products.`);
    console.log(`Type ${chalk.yellow("npx erakis launch")} to deploy application.`);
    console.log(`Happy coding! :D`);
}
