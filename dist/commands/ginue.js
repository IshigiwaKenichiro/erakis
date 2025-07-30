import { program } from 'commander';
import fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { AppStorage } from '../storage/AppStorage.js';
import { ProfileStorage } from '../storage/ProfileStorage.js';
export const ginueCommand = () => {
    program.command('ginue')
        .description('Generate ginue config file (.ginuerc.js)')
        .action(async () => {
        try {
            await createGinueRc();
            console.log('✅ .ginuerc.js file has been created!');
        }
        catch (error) {
            console.error('❌ An error occurred:', error);
            process.exit(1);
        }
    });
};
async function createGinueRc() {
    const configPath = path.join(process.cwd(), '.ginuerc.js');
    // 既存ファイルがある場合は上書き確認
    if (fs.existsSync(configPath)) {
        const shouldOverwrite = await askOverwrite();
        if (!shouldOverwrite) {
            console.log('Operation cancelled.');
            return;
        }
    }
    // AppStorageからカスタマイゼーション情報を取得
    const appStorage = new AppStorage();
    const appData = appStorage.getData();
    // ProfileStorageからプロファイル情報を取得
    const profileStorage = new ProfileStorage();
    const profileData = profileStorage.getData();
    const config = generateGinueConfig(appData.customizations, profileData.profiles);
    fs.writeFileSync(configPath, config, 'utf8');
}
async function askOverwrite() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question('⚠️  .ginuerc.js file already exists. Do you want to overwrite it? (y/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}
function generateGinueConfig(customizations, profiles) {
    // カスタマイゼーションが存在しない場合のデフォルト
    if (Object.keys(customizations).length === 0) {
        return generateDefaultConfig();
    }
    // 環境別設定を生成
    const envConfigs = {};
    Object.values(customizations).forEach(customization => {
        // development環境
        const devProfile = profiles[customization.development.profileName];
        if (devProfile && !envConfigs.development) {
            envConfigs.development = createEnvConfig(devProfile, customization.development);
        }
        // production環境
        const prodProfile = profiles[customization.production.profileName];
        if (prodProfile && !envConfigs.production) {
            envConfigs.production = createEnvConfig(prodProfile, customization.production);
        }
        // アプリ情報を各環境に追加
        if (envConfigs.development) {
            if (!envConfigs.development.app) {
                envConfigs.development.app = {};
            }
            envConfigs.development.app[customization.appName] = parseInt(customization.development.appId);
        }
        if (envConfigs.production) {
            if (!envConfigs.production.app) {
                envConfigs.production.app = {};
            }
            envConfigs.production.app[customization.appName] = parseInt(customization.production.appId);
        }
    });
    return `module.exports = {
    // ディレクトリの設定
    location: 'kintone-settings',

    // 環境設定
    env: {${Object.entries(envConfigs).map(([envName, config]) => `
        ${envName}: {
            domain: '${extractDomain(config.baseUrl)}',
            username: '${config.username}',
            password: '${config.password}',${config.basicUsername ? `\n            basic: '${config.basicUsername}:${config.basicPassword}',` : ''}${config.guestSpaceId && config.guestSpaceId !== '' ? `\n            guest: ${config.guestSpaceId},` : ''}
            app: {${Object.entries(config.app || {}).map(([appName, appId]) => `\n                "${appName}": ${appId}`).join(',')}
            }
        }`).join(',')}
    }
};
`;
}
function createEnvConfig(profile, app) {
    return {
        baseUrl: profile.baseUrl,
        username: profile.username,
        password: profile.password,
        basicUsername: profile.basicUsername,
        basicPassword: profile.basicPassword,
        guestSpaceId: app.guestSpaceId
    };
}
function extractDomain(baseUrl) {
    try {
        const url = new URL(baseUrl);
        return url.hostname;
    }
    catch {
        return baseUrl;
    }
}
function generateDefaultConfig() {
    return `module.exports = {
    // ディレクトリの設定
    location: 'kintone-settings',
    
    // kintone接続設定
    domain: 'example.cybozu.com',
    username: 'Administrator',
    password: 'your-password',
    
    // アプリ設定
    app: [10, 11, 12] // アプリIDを指定してください
};
`;
}
