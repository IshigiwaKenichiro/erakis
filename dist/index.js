#!/usr/bin/env node
import { program } from 'commander';
import { registerCommands } from './commands/registerCommands.js';
(() => {
    registerCommands();
    program.parse(process.argv);
})();
