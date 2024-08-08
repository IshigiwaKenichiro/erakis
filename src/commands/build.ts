import { exec } from '../utils/_exec.js';
import { getBuildTargets } from '../utils/_getTargets.js';
import { AppStorage } from '../storage/AppStorage.js';
import { program } from 'commander';


export function buildCommand() {
    program.command('build')
        .description('Build all sources and targets')
        .action(build);
}

export function build(){

    const appStorage = new AppStorage();
    const { customizations } = appStorage.getData();

    const appNames = Object.keys(customizations);

    let distDir = `build/app`;
    if (0 == appNames.length) return;

    if (1 == appNames.length) {
        distDir = `${distDir}/${appNames[0]}`;
    };

    const files = getBuildTargets();

    exec(`npx parcel build ${files.join(' ')} --dist-dir ${distDir} --no-cache`);

}