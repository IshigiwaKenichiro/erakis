import chalk from 'chalk';
import inq from 'inquirer';
import { resolveAppRef } from './_helpers.js';
import { deployAndWait, formatDeployStatus, checkSchemaDivergence } from '../../utils/schemaWriter.js';
/**
 * `erakis schema deploy <appRef> [-e env]`
 * preview の変更を kintone 本番へデプロイする。完了までポーリング。
 * LIVE getDeployStatus 読み取り / deployApp 書き込み。
 */
export async function schemaDeploy(appRef, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema deploy phase3test'));
        console.error(chalk.gray('  example: erakis schema deploy phase3test -e prod'));
        console.error(chalk.gray('  example: erakis schema deploy 463'));
        return;
    }
    const ref = await resolveAppRef(appRef, { profile: options.profile, env: options.env });
    if (!ref)
        return;
    process.stdout.write(chalk.gray(`deploying ${ref.label} (app ${ref.appId})...`));
    try {
        await deployAndWait(ref.client, ref.appId);
        console.log(chalk.green(' ✔ deployed.'));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(` ✗ ${msg}`));
    }
}
/**
 * `erakis schema undeploy <appRef> [-e env]`
 * preview に積んだ変更を破棄して live 状態に戻す（破壊的操作）。
 * 確認プロンプトあり（-y でスキップ）。
 * LIVE getDeployStatus 読み取り / deployApp(revert:true) 書き込み。
 */
export async function schemaUndeploy(appRef, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema undeploy phase3test'));
        console.error(chalk.gray('  example: erakis schema undeploy phase3test -e prod'));
        console.error(chalk.gray('  example: erakis schema undeploy 463'));
        return;
    }
    const ref = await resolveAppRef(appRef, { profile: options.profile, env: options.env });
    if (!ref)
        return;
    if (!options.yes) {
        const { ok } = await inq.prompt([{
                type: 'confirm',
                name: 'ok',
                message: `app ${ref.appId} (${ref.label}) の preview 変更を破棄しますか？この操作は取り消せません。`,
                default: false,
            }]);
        if (!ok) {
            console.log(chalk.gray('キャンセルしました。'));
            return;
        }
    }
    process.stdout.write(chalk.gray(`reverting ${ref.label} (app ${ref.appId})...`));
    try {
        await deployAndWait(ref.client, ref.appId, undefined, { revert: true });
        console.log(chalk.green(' ✔ reverted.'));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(` ✗ ${msg}`));
    }
}
/**
 * `erakis schema get-deploy-status <appRef> [-e env]`
 * preview と本番のスキーマを実際に比較して差分の有無を表示する。
 * PROCESSING 中は比較をスキップし「反映処理中」のみ報告。
 * LIVE getDeployStatus 読み取り + フィールド/レイアウト/ビュー比較。
 */
export async function schemaGetDeployStatus(appRef, options) {
    if (!appRef) {
        console.error(chalk.red('app ref is required.'));
        console.error(chalk.gray('  example: erakis schema get-deploy-status phase3test'));
        console.error(chalk.gray('  example: erakis schema get-deploy-status phase3test -e prod'));
        console.error(chalk.gray('  example: erakis schema get-deploy-status 463'));
        return;
    }
    const ref = await resolveAppRef(appRef, { profile: options.profile, env: options.env });
    if (!ref)
        return;
    try {
        const resp = await ref.client.app.getDeployStatus({ apps: [ref.appId] });
        const rawEntries = (resp.apps ?? []).map((a) => ({
            app: String(a.app),
            status: String(a.status),
        }));
        // PROCESSING 以外は live/preview を実比較して divergence を付与する
        const entries = await Promise.all(rawEntries.map(async (e) => {
            if (e.status === 'PROCESSING')
                return e;
            const divergence = await checkSchemaDivergence(ref.client, e.app);
            return { ...e, divergence };
        }));
        const text = formatDeployStatus(entries);
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const entry = entries[i];
            const line = lines[i];
            if (!entry) {
                console.log(line);
                continue;
            }
            if (entry.status === 'PROCESSING' || entry.divergence === 'has-diff') {
                console.log(chalk.yellow(line));
            }
            else if (entry.status === 'FAIL' || entry.status === 'CANCEL') {
                console.log(chalk.red(line));
            }
            else if (entry.divergence === 'no-diff') {
                console.log(chalk.green(line));
            }
            else {
                console.log(chalk.gray(line));
            }
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`failed to get deploy status: ${msg}`));
    }
}
