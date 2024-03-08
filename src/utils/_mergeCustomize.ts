
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import type { App } from '../models.js';
import { ProfileStorage } from '../storage/ProfileStorage.js';

const profileStorage = new ProfileStorage();

/**
 * 
 * @param appName カスタマイズ名
 * @param app kintoneアプリの設定情報
 */
export async function mergeCustomize(appName : string, app : App) {
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

