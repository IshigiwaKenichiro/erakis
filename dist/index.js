#!/usr/bin/env node
import { program } from 'commander';
import { appCommand } from './commands/app.js';
import { buildCommand } from './commands/build.js';
import { clearCommand } from './commands/clear.js';
import { genkeyCommand } from './commands/genkey.js';
import { launchCommand } from './commands/launch.js';
import { profileCommand } from './commands/profile.js';
import { startCommand } from './commands/start.js';
import { initCommand } from './commands/init.js';
(() => {
    program.name('erakis')
        .description('Erakis helps your kintone customization.');
    initCommand();
    appCommand();
    buildCommand();
    clearCommand();
    genkeyCommand();
    launchCommand();
    profileCommand();
    startCommand();
    program.parse(process.argv);
})();
