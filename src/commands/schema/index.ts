import { program } from 'commander';
import { schemaPull } from './pull.js';
import { schemaDiff } from './diff.js';
import { schemaDigest } from './digest.js';
import { schemaDocs } from './docs.js';
import { schemaDeploy, schemaUndeploy, schemaGetDeployStatus } from './deploy.js';
import { schemaGetLayout, schemaUpdateLayout, schemaSyncLayout } from './layout.js';
import { schemaGetViews, schemaUpdateViews, schemaSyncViews } from './views.js';
import { schemaGetField, schemaCreateField, schemaUpdateField, schemaDeleteField } from './field.js';
import { schemaCreate } from './create.js';

/**
 * `erakis schema` サブコマンド群を Commander のルートプログラムに登録する。
 * schema コマンドツリーの唯一のエントリポイント。
 * CLI オプションとアクションの結線のみを行う薄いモジュール。kintone API 呼び出しなし。
 */
export function schemaCommand() {
    const sub = program
        .command('schema')
        .description('manage kintone app schema. all reads use preview API; deploy publishes to live.')
        .addHelpText('after', `
File path notes (for get-field, create-field, update-field, get-layout, update-layout, get-views, update-views):
  Relative path:        field.json  →  resolved from current directory
  Absolute (Linux/Mac): /tmp/field.json
  Absolute (Windows):   C:\\work\\erakis-test\\tmp\\field.json
  Path with spaces:     "my folder/field.json"  (quote in shell)`);

    sub.command('create [spaceIdOrGuestSpaceId]')
        .description('create an empty kintone app. optional numeric space or guest-space ID.')
        .addHelpText('after', '\nUse --guest-space when the ID is a guest space ID (uses /k/guest/<id>/v1/... endpoints).\nAfter creation, run "app register" or "app connect" to add it to erakis management.')
        .option('--profile <name>', 'profile for the kintone domain/auth')
        .option('--guest-space', 'treat the space ID as a guest-space ID')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaCreate);

    sub.command('pull')
        .description('snapshot all customization apps (dev+prod) to kintone-app/snapshots/<timestamp>/')
        .option('-a, --app <name>', 'snapshot specific app only')
        .option('--no-latest', 'skip updating kintone-app/latest.json')
        .action(schemaPull);

    sub.command('diff [a] [b]')
        .description('compare fields+layout+views. diff <appName> = dev vs prod; diff <appId> <appId> = two apps')
        .option('--full', 'show normalized JSON unified diff in addition to report')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaDiff);

    sub.command('digest')
        .description('generate field digest from LIVE kintone preview API')
        .option('-a, --app <name>', 'registered app name or appId[/guestSpaceId]')
        .option('-f, --format <format>', 'output format: md or tsv', 'md')
        .option('-e, --env <env>', 'target environment: dev or prod (ignored for raw appId)', 'dev')
        .option('--profile <name>', 'profile name (required when appId is not registered)')
        .action(schemaDigest);

    sub.command('docs')
        .description('generate docs/schema/README.md from LIVE kintone preview API')
        .option('-e, --env <env>', 'target environment: dev or prod', 'dev')
        .action(schemaDocs);

    sub.command('deploy <appRef>')
        .description('deploy preview changes to live. appRef: appName [-e env] or appId[/guestSpaceId]')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaDeploy);

    sub.command('undeploy <appRef>')
        .description('discard preview changes and revert to live state. prompts for confirmation.')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaUndeploy);

    sub.command('get-deploy-status <appRef>')
        .description('show current deploy status (PROCESSING/SUCCESS/FAIL/CANCEL). appRef: appName or appId')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaGetDeployStatus);

    sub.command('get-layout <appRef> [filePath]')
        .description('get preview layout. outputs { layout: [...] } JSON to filePath or stdout')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaGetLayout);

    sub.command('update-layout <appRef> <filePath>')
        .description('replace preview layout with JSON from filePath. accepts { layout:[...] } or bare array')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaUpdateLayout);

    sub.command('sync-layout <appName>')
        .description('copy preview layout from the opposite env to --to env (appName only)')
        .requiredOption('--to <env>', 'target environment: dev or prod')
        .option('-y, --yes', 'skip confirmation prompt (required for --to prod)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaSyncLayout);

    sub.command('get-views <appRef> [filePath]')
        .description('get preview views. outputs { views: {...} } JSON to filePath or stdout')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaGetViews);

    sub.command('update-views <appRef> <filePath>')
        .description('replace preview views with JSON from filePath. accepts { views:{...} } or bare object. ids are auto-sanitized')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaUpdateViews);

    sub.command('sync-views <appName>')
        .description('copy preview views from the opposite env to --to env (appName only). ids are auto-sanitized')
        .requiredOption('--to <env>', 'target environment: dev or prod')
        .option('-y, --yes', 'skip confirmation prompt (required for --to prod)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaSyncViews);

    sub.command('get-field <appRef> [filePath]')
        .description('get preview field definitions. outputs { properties: {...} } JSON to filePath or stdout')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .action(schemaGetField);

    sub.command('create-field <appRef> <filePath>')
        .description('add fields to preview from JSON file. accepts { properties:{...} } or bare object')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaCreateField);

    sub.command('update-field <appRef> <filePath>')
        .description('update fields in preview from JSON file. accepts { properties:{...} } or bare object')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaUpdateField);

    sub.command('delete-field <appRef> <fieldCodes...>')
        .description('delete fields from preview by code. WARNING: deploy will permanently delete field data.')
        .option('-e, --env <env>', 'target environment: dev or prod (default: dev)')
        .option('--profile <name>', 'profile name for raw appId resolution')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(schemaDeleteField);
}
