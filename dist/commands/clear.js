import { program } from 'commander';
import fs from 'fs-extra';
export function clearCommand() {
    program.command('clear')
        .description('Clear all directories and build files')
        .action(clear);
}
export function clear() {
    fs.removeSync('dist');
    fs.removeSync('build');
    console.log('success. build and dist directory removed.');
}
