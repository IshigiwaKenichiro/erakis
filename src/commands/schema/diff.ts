import chalk from 'chalk';
import { resolveAppRef, parseRawAppRef, type AppRefResolved } from './_helpers.js';
import { diffSchemas, formatDiffSummary, formatFullDiff, type DiffResult } from '../../gen/schemaDiff.js';
import { diffLayouts, formatLayoutDiffReport, formatFullLayoutDiff, type LayoutDiffResult } from '../../gen/layoutDiff.js';
import { diffViews, formatViewsDiffReport, formatFullViewsDiff, type ViewsDiffResult } from '../../gen/viewsDiff.js';
import type { SchemaDiffOptions } from './types.js';

/**
 * 解決済み AppRef からフィールド・レイアウト・ビューを取得する。
 * すべての呼び出しで LIVE preview: true を使用する。読み取り専用。
 */
async function fetchAll(ref: AppRefResolved): Promise<{
    fields: Record<string, any>;
    layout: any[];
    views: Record<string, any>;
} | null> {
    try {
        const [fieldsResp, layoutResp, viewsResp] = await Promise.all([
            ref.client.app.getFormFields({ app: ref.appId, preview: true }),
            ref.client.app.getFormLayout({ app: ref.appId, preview: true } as any),
            ref.client.app.getViews({ app: ref.appId, preview: true } as any),
        ]);

        const fields: Record<string, any> = {};
        for (const code of Object.keys(fieldsResp.properties).sort()) {
            fields[code] = fieldsResp.properties[code];
        }

        return {
            fields,
            layout: (layoutResp as any).layout,
            views: (viewsResp as any).views,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`failed to fetch ${ref.label}: ${msg}`));
        return null;
    }
}

/**
 * `erakis schema diff <a> [<b>]` - 2 つのアプリ参照間でフィールド・レイアウト・ビューを比較する。
 *
 * 単一引数形式: diff <appName>
 *   登録済みアプリの dev と prod を比較する。
 *   例: erakis schema diff phase3test
 *
 * 二引数形式: diff <appId[/guestSpaceId]> <appId[/guestSpaceId]>
 *   任意の 2 つのアプリ ID を比較する。
 *   例: erakis schema diff 463 464
 *   例: erakis schema diff 55/1 56
 *
 * --full は構造レポートに加えて正規化 JSON unified diff を出力する。
 * --profile <name> は apps.json にマッチがない場合の生 appId 解決用プロファイルを指定する。
 * フィールド・レイアウト・ビューを常に一括出力する。
 * LIVE preview API から読み取り専用 — 書き込みなし。
 */
export async function schemaDiff(a: string | undefined, b: string | undefined, options: SchemaDiffOptions) {
    if (!a) {
        console.error(chalk.red('specify an app name or app ID.'));
        console.error(chalk.gray('  example: erakis schema diff phase3test'));
        console.error(chalk.gray('  example: erakis schema diff 463 464'));
        return;
    }

    let refA: AppRefResolved | null;
    let refB: AppRefResolved | null;

    if (b == null) {
        // 単一引数: appName → resolveAppRef で dev vs prod
        refA = await resolveAppRef(a, { env: 'dev', profile: options.profile });
        if (!refA) return;
        refB = await resolveAppRef(a, { env: 'prod', profile: options.profile });
        if (!refB) return;
    } else {
        // 二引数: appId[/guestSpaceId] 形式のみ — appName 不可
        if (!parseRawAppRef(a) || !parseRawAppRef(b)) {
            console.error(chalk.red('two-arg diff requires numeric app IDs (e.g. 463 464 or 55/1 56).'));
            console.error(chalk.gray('  for a named app: erakis schema diff <appName>'));
            return;
        }
        refA = await resolveAppRef(a, { profile: options.profile });
        if (!refA) return;
        refB = await resolveAppRef(b, { profile: options.profile });
        if (!refB) return;
    }

    console.log(chalk.gray(`fetching LIVE ${refA.label}...`));
    const dataA = await fetchAll(refA);
    if (!dataA) return;

    console.log(chalk.gray(`fetching LIVE ${refB.label}...`));
    const dataB = await fetchAll(refB);
    if (!dataB) return;

    // フィールド差分
    const fieldResult = diffSchemas(dataA.fields, dataB.fields);
    const fieldSummary = formatDiffSummary(fieldResult, refA.label, refB.label, a, dataA.fields, dataB.fields);
    printDiff(fieldSummary, fieldResult);

    if (options.full) {
        const fullDiff = formatFullDiff(dataA.fields, dataB.fields, fieldResult);
        if (fullDiff.trim()) {
            console.log('');
            console.log(chalk.cyan('## Fields unified diff (--full)'));
            printFullDiffColored(fullDiff);
        }
    }

    // レイアウト差分
    const layoutResult = diffLayouts(dataA.layout, dataB.layout);
    const layoutReport = formatLayoutDiffReport(layoutResult);
    console.log('');
    printLayoutDiff(layoutReport, layoutResult);

    if (options.full) {
        const fullLayoutDiff = formatFullLayoutDiff(dataA.layout, dataB.layout);
        if (fullLayoutDiff.trim()) {
            console.log('');
            console.log(chalk.cyan('## Layout unified diff (--full)'));
            printFullDiffColored(fullLayoutDiff);
        }
    }

    // ビュー差分
    const viewsResult = diffViews(dataA.views, dataB.views);
    const viewsReport = formatViewsDiffReport(viewsResult);
    console.log('');
    printViewsDiff(viewsReport, viewsResult);

    if (options.full) {
        const fullViewsDiff = formatFullViewsDiff(dataA.views, dataB.views);
        if (fullViewsDiff.trim()) {
            console.log('');
            console.log(chalk.cyan('## Views unified diff (--full)'));
            printFullDiffColored(fullViewsDiff);
        }
    }
}

function printDiff(summary: string, result: DiffResult) {
    for (const line of summary.split('\n')) {
        if (line.startsWith('  + '))      console.log(chalk.green(line));
        else if (line.startsWith('  ~ ')) console.log(chalk.yellow(line));
        else if (line.startsWith('  - ')) console.log(chalk.red(line));
        else if (line.startsWith('  ! ')) console.log(chalk.magenta(line));
        else                              console.log(line);
    }
    const total = result.add.length + result.update.length + result.delete.length + result.typeChange.length;
    if (total === 0) console.log(chalk.green('✔ no differences found.'));
}

function printLayoutDiff(report: string, result: LayoutDiffResult) {
    for (const line of report.split('\n')) {
        const t = line.trimStart();
        if (t.startsWith('+ '))      console.log(chalk.green(line));
        else if (t.startsWith('- ')) console.log(chalk.red(line));
        else if (t.startsWith('~ ')) console.log(chalk.yellow(line));
        else                         console.log(line);
    }
    const total = result.add.length + result.delete.length + result.move.length + result.change.length;
    if (total === 0) console.log(chalk.green('✔ Layout: no differences found.'));
}

function printViewsDiff(report: string, result: ViewsDiffResult) {
    for (const line of report.split('\n')) {
        const t = line.trimStart();
        if (t.startsWith('+ '))      console.log(chalk.green(line));
        else if (t.startsWith('- ')) console.log(chalk.red(line));
        else if (t.startsWith('~ ')) console.log(chalk.yellow(line));
        else                         console.log(line);
    }
    const total = result.add.length + result.delete.length + result.change.length;
    if (total === 0) console.log(chalk.green('✔ Views: no differences found.'));
}

function printFullDiffColored(text: string) {
    for (const line of text.split('\n')) {
        if (line.startsWith('+'))       console.log(chalk.green(line));
        else if (line.startsWith('-'))  console.log(chalk.red(line));
        else if (line.startsWith('@@')) console.log(chalk.cyan(line));
        else if (line.startsWith('##')) console.log(chalk.bold(line));
        else                            console.log(line);
    }
}
