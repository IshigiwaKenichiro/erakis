
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import type { App } from '../models.js';
import { ProfileStorage } from '../storage/ProfileStorage.js';

const profileStorage = new ProfileStorage();

const ARTIFACT_FILES = [
    'customize.desktop.js',
    'customize.desktop.css',
    'customize.mobile.js',
    'customize.mobile.css',
];

const LOCAL_REQUIRED_FILES = [
    ['customize.desktop.ts', 'customize.desktop.js'],
    ['customize.desktop.css'],
    ['customize.mobile.ts', 'customize.mobile.js'],
    ['customize.mobile.css'],
];

/**
 * 書き込み前アサーション: 指定 status に必要なローカルファイルが揃っていない場合はエラーをスローする。
 * kintone API 書き込み (uploadFile, updateAppCustomize, deployApp) の前に必ず呼び出すこと。
 * - local: desktop ts/js + desktop.css + mobile ts/js + mobile.css の4ファイル（localhost URL用）が必要
 * - fixed: dist/src/app/<name>/customize.* の4ファイルが必要
 * - released: build/app/<name>/customize.* の4ファイルが必要
 */
function assertLaunchFilesReady(appName: string, status: string): void {
    if (status === 'local') {
        const appDir = path.join('src', 'app', appName);
        const files = fs.existsSync(appDir) ? fs.readdirSync(appDir) : [];
        const missing: string[] = [];
        for (const candidates of LOCAL_REQUIRED_FILES) {
            const found = candidates.some(f => files.includes(f));
            if (!found) missing.push(candidates.join(' or '));
        }
        if (missing.length > 0) {
            throw new Error(
                `"${appName}" is missing local customization files needed for localhost URLs.\n` +
                `Missing (need one per group):\n${missing.map(m => `  ${m}`).join('\n')}\n` +
                `Use "erakis app connect" to set up customization first.`
            );
        }
    } else if (status === 'fixed' || status === 'released') {
        const baseDir = status === 'fixed'
            ? path.join('dist', 'src', 'app', appName)
            : path.join('build', 'app', appName);
        const missing = ARTIFACT_FILES
            .map(f => path.join(baseDir, f))
            .filter(p => !fs.existsSync(p));
        if (missing.length > 0) {
            throw new Error(`"${appName}" is missing ${status} build artifacts. Run "erakis build" first.\nMissing:\n${missing.map(p => `  ${p}`).join('\n')}`);
        }
    }
}

/**
 * `erakis launch` - kintoneアプリのカスタマイズ設定を更新してデプロイする。
 * kintone API 書き込み: updateAppCustomize + deployApp。
 * API 書き込み前にローカルファイルの存在を確認する。
 * @param appName カスタマイズ名
 * @param app kintoneアプリの設定情報
 */
export async function mergeCustomize(appName : string, app : App) {
    assertLaunchFilesReady(appName, app.status);

    const isGuest = !_.isEmpty(app.guestSpaceId);
    const { profiles } = profileStorage.getData();

    const profile = profiles[app.profileName];
    const client = new KintoneRestAPIClient({
        baseUrl: profile.baseUrl,
        basicAuth: {
            username: profile.basicUsername, password: profile.basicPassword,
        },
        auth: {
            username: profile.username, password: profile.password
        },
        guestSpaceId: isGuest ? app.guestSpaceId : undefined
    });

    const p2cdn = path.join('src', 'app', appName, `cdn.json`);
    const cdnJson = fs.existsSync(p2cdn) ? fs.readJsonSync(path.join('src', 'app', appName, `cdn.json`)) : {
        scope : 'ALL' as "ALL" | "ADMIN" | "NONE",
        desktop : {
            js : [],
            css : []
        },
        mobile : {
            js : [],
            css : []
        }
    }

    const customize = {
        scope : 'ALL'as "ALL" | "ADMIN" | "NONE",
        desktop : {
            js : (cdnJson.desktop?.js ?? []).map((url : string) => ({type : 'URL', url})),
            css : (cdnJson.desktop?.css ?? []).map((url : string) => ({type : 'URL', url}))
        },
        mobile : {
            js : (cdnJson.mobile?.js ?? []).map((url : string) => ({type : 'URL', url})),
            css : (cdnJson.mobile?.css ?? []).map((url : string) => ({type : 'URL', url}))
        }
    }
    

    if ("local" == app.status) {
        addCustom(customize.desktop.js, 'customize.desktop.js', `https://localhost:51500/src/app/${appName}/customize.desktop.js`);
        addCustom(customize.desktop.css, 'customize.desktop.css', `https://localhost:51500/src/app/${appName}/customize.desktop.css`);
        addCustom(customize.mobile.js, 'customize.mobile.js', `https://localhost:51500/src/app/${appName}/customize.mobile.js`);
        addCustom(customize.mobile.css, 'customize.mobile.css', `https://localhost:51500/src/app/${appName}/customize.mobile.css`);
    } else if ('fixed' == app.status) {
        const desktopJs = await client.file.uploadFile({ file: { path: path.join('dist', 'src', 'app', appName, 'customize.desktop.js') } });
        const desktopCss = await client.file.uploadFile({ file: { path: path.join('dist', 'src', 'app', appName, 'customize.desktop.css') } });
        const mobileJs = await client.file.uploadFile({ file: { path: path.join('dist', 'src', 'app', appName, 'customize.mobile.js') } });
        const mobileCss = await client.file.uploadFile({ file: { path: path.join('dist', 'src', 'app', appName, 'customize.mobile.css') } });

        fileCustom(customize.desktop.js, 'customize.desktop.js', 'text/javascript', desktopJs.fileKey, 1);
        fileCustom(customize.desktop.css, 'customize.desktop.css', 'text/css', desktopCss.fileKey, 1);
        fileCustom(customize.mobile.js, 'customize.mobile.js', 'text/javascript', mobileJs.fileKey, 1);
        fileCustom(customize.mobile.css, 'customize.mobile.css', 'text/css', mobileCss.fileKey, 1);

    } else {
        const desktopJs = await client.file.uploadFile({ file: { path: path.join('build', 'app', appName, 'customize.desktop.js') } });
        const desktopCss = await client.file.uploadFile({ file: { path: path.join('build', 'app', appName, 'customize.desktop.css') } });
        const mobileJs = await client.file.uploadFile({ file: { path: path.join('build', 'app', appName, 'customize.mobile.js') } });
        const mobileCss = await client.file.uploadFile({ file: { path: path.join('build', 'app', appName, 'customize.mobile.css') } });

        fileCustom(customize.desktop.js, 'customize.desktop.js', 'text/javascript', desktopJs.fileKey, 0);
        fileCustom(customize.desktop.css, 'customize.desktop.css', 'text/css', desktopCss.fileKey, 0);
        fileCustom(customize.mobile.js, 'customize.mobile.js', 'text/javascript', mobileJs.fileKey, 0);
        fileCustom(customize.mobile.css, 'customize.mobile.css', 'text/css', mobileCss.fileKey, 0);
    }

    await client.app.updateAppCustomize({ app: app.appId, ...customize, });

    await client.app.deployApp({ apps: [{ app: app.appId }] });

}


function fileCustom(target : any[], fileName : string, contentType : string, fileKey : string, size : number) {
    const idx = target.findIndex(js => {
        switch (js.type) {
            case 'URL': return js.url.includes(fileName)
            case 'FILE': return js.file.name.includes(fileName)
        }
    });

    if (0 <= idx) {
        target[idx] = {
            type: 'FILE', file: { contentType, fileKey, size, name: fileName }
        }
    } else {
        target.push({
            type: 'FILE', file: { contentType, fileKey, size, name: fileName }
        })
    }
}


function addCustom(target : any[], fileName : string, url : string) {
    const idx = target.findIndex(js => {
        switch (js.type) {
            case 'URL': return js.url.includes(fileName)
            case 'FILE': return js.file.name.includes(fileName)
        }
    });

    if (0 <= idx) {
        target[idx] = {
            type: 'URL', url
        }
    } else {
        target.push({
            type: 'URL', url
        })
    }
}

