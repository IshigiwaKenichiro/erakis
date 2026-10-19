import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { ProfileStorage } from '../storage/ProfileStorage.js';
import { AppStorage } from '../storage/AppStorage.js';
import { ensureGitignore } from '../utils/gitignore.js';

export const mcpCommand = () => {
    program
        .command('mcp')
        .description('Generate .mcp.json configuration file for kintone-mcp')
        .action(async () => {
            try {
                await generateMcpConfig();
                console.log('✨ .mcp.json file generated successfully!');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('❌ Failed to generate .mcp.json file:', errorMessage);
                process.exit(1);
            }
        });
};

async function generateMcpConfig() {
    const profileStorage = new ProfileStorage();
    const appStorage = new AppStorage();
    
    // プロファイル一覧を取得
    const profileData = profileStorage.getData();
    const profiles = profileData.profiles;
    
    // アプリデータを取得してカスタマイズごとの環境情報を確認
    const appData = appStorage.getData();
    const customizations = appData.customizations;
    
    const mcpConfig: {
        mcpServers: Record<string, {
            type: string;
            command: string;
            env: {
                KINTONE_BASE_URL: string;
                KINTONE_USERNAME: string;
                KINTONE_PASSWORD: string;
            };
        }>
    } = {
        mcpServers: {}
    };
    
    // 使用されているプロファイル名（環境名）を収集してMCPサーバー設定を作成
    const usedProfiles = new Set<string>();
    Object.values(customizations).forEach(custom => {
        usedProfiles.add(custom.development.profileName);
        usedProfiles.add(custom.production.profileName);
    });
    
    // 環境名ごとにMCPサーバー設定を作成
    usedProfiles.forEach(profileName => {
        if (profiles[profileName]) {
            const profile = profiles[profileName];
            
            mcpConfig.mcpServers[`kintone-${profileName}`] = {
                type: "stdio",
                command: "kintone-mcp-server",
                env: {
                    KINTONE_BASE_URL: profile.baseUrl,
                    KINTONE_USERNAME: profile.username,
                    KINTONE_PASSWORD: profile.password
                }
            };
        }
    });
    
    // カレントディレクトリに.mcp.jsonを出力
    const outputPath = path.join(process.cwd(), '.mcp.json');
    await fs.writeJSON(outputPath, mcpConfig, { spaces: 2 });
    // kintone-mcp-server は平文の環境変数しか受け取れないので、せめて git に入らないようにする
    ensureGitignore(path.join(process.cwd(), '.gitignore'));
    
    console.log(`📄 .mcp.json file created: ${outputPath}`);
    console.log(`🔧 Number of MCP server configurations: ${Object.keys(mcpConfig.mcpServers).length}`);
    
    // Display list of created environments
    Object.keys(mcpConfig.mcpServers).forEach(serverName => {
        console.log(`   - ${serverName}`);
    });
}