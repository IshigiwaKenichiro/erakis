import fs from 'fs-extra';
import path from 'path';

import { AppStorage } from '../storage/AppStorage.js';

const appStorage = new AppStorage();

/**
 * アプリのカスタマイズエントリポイントパス一覧を返す（ts優先）。
 * 空ディレクトリや CSS のみのアプリは [] を返す。
 * このリストが空でない場合のみカスタマイズアプリとみなす。
 */
export function getCustomizationEntryPoints(appName: string): string[] {
    const appDir = path.join('src', 'app', appName);
    if (!fs.existsSync(appDir)) return [];

    const files = fs.readdirSync(appDir);
    const items: string[] = [];

    for (const f of ['customize.mobile.ts', 'customize.mobile.js']) {
        if (files.includes(f)) { items.push(path.join(appDir, f)); break; }
    }
    for (const f of ['customize.desktop.ts', 'customize.desktop.js']) {
        if (files.includes(f)) { items.push(path.join(appDir, f)); break; }
    }

    return items;
}

/**
 * カスタマイズエントリポイントが1つ以上あれば true を返す。
 * 空の src/app/<name> ディレクトリや CSS のみのアプリは false。
 */
export function isCustomizationApp(appName: string): boolean {
    return getCustomizationEntryPoints(appName).length > 0;
}

export function getBuildTargets() {
    const { customizations } = appStorage.getData();

    return Object.values(customizations)
        .reduce((acc: string[], custom) => {
            acc.push(...getCustomizationEntryPoints(custom.appName));
            return acc;
        }, []);
}

export function getDevTargets() {
    const targets = getBuildTargets();

    const index = path.join('.erakis', 'index', 'index.html');
    const test = path.join('src', 'test', 'index.html');

    if (fs.existsSync(index)) targets.push(index);
    if (fs.existsSync(test)) targets.push(test);

    return targets;
}

export type StartCheckResult =
    | { canStart: true; customizationCount: number; htmlOnly: boolean }
    | { canStart: false };

/**
 * 起動対象リストを検査して start の可否を判定する純粋関数。
 * targets.length === 0 のときだけ中止。html のみでも起動を許可する。
 * htmlOnly: true のときは「カスタマイズなし・html のみ起動」を呼び出し側が通知すること。
 */
export function checkStartTargets(targets: string[]): StartCheckResult {
    if (targets.length === 0) return { canStart: false };
    const customizationCount = targets.filter(t => !t.endsWith('.html')).length;
    return { canStart: true, customizationCount, htmlOnly: customizationCount === 0 };
}
