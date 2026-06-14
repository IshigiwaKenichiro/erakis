import { exec } from '../utils/_exec.js';
import { getBuildTargets, isCustomizationApp } from '../utils/_getTargets.js';
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

    // 登録専用アプリ（src/app/<name> なし）はビルド対象から除外
    const customizationAppNames = Object.keys(customizations).filter(isCustomizationApp);

    let distDir = `build/app`;
    if (0 == customizationAppNames.length) {
        console.log('No customization apps found. Nothing to build.');
        return;
    }

    if (1 == customizationAppNames.length) {
        distDir = `${distDir}/${customizationAppNames[0]}`;
    };

    const files = getBuildTargets();
    if (0 == files.length) {
        console.log('No customization source files found. Nothing to build.');
        return;
    }

    exec(`npx parcel build ${files.join(' ')} --dist-dir ${distDir} --no-cache`);

}