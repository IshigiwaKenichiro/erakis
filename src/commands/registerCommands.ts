import { program } from 'commander';
import { appCommand } from './app/index.js';
import { schemaCommand } from './schema/index.js';
import { buildCommand } from './build.js';
import { clearCommand } from './clear.js';
import { genkeyCommand } from './genkey.js';
import { launchCommand } from './launch.js';
import { profileCommand } from './profile.js';
import { startCommand } from './start.js';
import { initCommand } from './init.js';
import { ginueCommand } from './ginue.js';
import { mcpCommand } from './mcp.js';
import { apiCommand } from './api.js';
import { guideCommand } from './guide.js';
import { searchCommand } from './search.js';

/**
 * すべてのサブコマンドを commander のルートプログラムに登録する。
 * エントリ（index.ts）と spec の両方から呼ぶ。spec はここで登録された一覧を使って、
 * guide の表と Skill 本文にコマンドの書き漏れが無いかを確かめる。
 */
export function registerCommands() {
    program.name('erakis')
        .description('Erakis helps your kintone customization.');

    initCommand();
    appCommand();
    schemaCommand();
    apiCommand();
    searchCommand();
    buildCommand();
    clearCommand();
    genkeyCommand();
    launchCommand();
    profileCommand();
    startCommand();
    ginueCommand();
    mcpCommand();
    guideCommand();
}
