import { program } from 'commander';
import { status } from './status.js';
import { connect } from './connect.js';
import { register } from './register.js';
import { unregister } from './unregister.js';
import { codegen } from './codegen.js';
import { open } from './open.js';
/**
 * `erakis app` サブコマンド群を Commander ルートプログラムに登録する。
 * このファンクションが app コマンドツリーの唯一のエントリポイント。
 * CLI オプションとアクションを繋ぐだけで、ロジックは各モジュールに委ねる。
 * app コマンド: status, connect, register, unregister, codegen, open。
 * スキーマ・digest・docs 機能は `erakis schema ...` に移動済み。
 * kintone への読み書きなし（登録のみ、API 呼び出しなし）。
 */
export function appCommand() {
    const sub = program
        .command('app')
        .description('manage kintone customized app.');
    sub.command('status')
        .description('show all status of the application.')
        .action(status);
    sub.command('connect')
        .description('register an app pair AND generate customization source/template files.')
        .addHelpText('after', '\nUse "register" instead if you only need to record the app pair without generating files.')
        .option('-n, --name <name>', 'name of the customization')
        .option('--dev-profile <profileName>', 'development profile name')
        .option('--prod-profile <profileName>', 'production profile name')
        .option('--dev-url <url>', 'development app URL')
        .option('--prod-url <url>', 'production app URL')
        .option('-y, --yes', 'skip confirmation prompts')
        .action(connect);
    sub.command('register')
        .description('record an app pair in .erakis/apps.json (no customization files generated).')
        .addHelpText('after', '\nUse "connect" instead if you also want to generate customization source/template files.')
        .option('-n, --name <name>', 'name of the app')
        .option('--dev-profile <profileName>', 'development profile name')
        .option('--prod-profile <profileName>', 'production profile name')
        .option('--dev-url <url>', 'development app URL')
        .option('--prod-url <url>', 'production app URL')
        .option('-y, --yes', 'skip confirmation prompts')
        .action(register);
    sub.command('unregister')
        .description('remove an app from erakis management without deleting customization files.')
        .option('-a, --app <name>', 'app name to unregister')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(unregister);
    sub.command('codegen')
        .description('regenerate code file on your application.')
        .option('-a, --app <name>', 'application name')
        .action(codegen);
    sub.command('open')
        .description('show kintone')
        .option('-a, --app <name>', 'application name')
        .action(open);
}
