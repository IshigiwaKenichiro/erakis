import fs from 'fs-extra';
import path from 'path';

import { AppStorage } from '../storage/AppStorage.js';

const appStorage = new AppStorage();

function getTargets(applicationName : string) {
    const appDir = path.join("src", "app", applicationName);

    const dirs = fs.readdirSync(appDir);

    const items : string[] = [];

    for (let item of ['customize.mobile.ts', 'customize.mobile.js']) {
        if (dirs.includes(item)) {
            const itemPath = path.join(appDir, item);
            items.push(itemPath);
            break;//ts優先。
        }
    }
    for (let item of ['customize.desktop.ts', 'customize.desktop.js']) {
        if (dirs.includes(item)) {
            const itemPath = path.join(appDir, item);
            items.push(itemPath);
            break;//ts優先。
        }
    }

    return items;
}

export function getBuildTargets() {
    const { customizations } = appStorage.getData();

    return Object.values(customizations)
        .reduce((acc : string[], custom) => {
            acc.push(...getTargets(custom.appName));
            return acc
        }, [] )
}

export function getDevTargets() {
    const targets = getBuildTargets();

    const index = path.join('.erakis','index','index.html');
    const test = path.join('src', 'test','index.html');


    if(fs.existsSync(index)) targets.push(index);
    if(fs.existsSync(test)) targets.push(test);

    return targets;
}


