import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
// kintoneフィールド型 → TypeScript値型マッピング
const FIELD_VALUE_TYPE = {
    'SINGLE_LINE_TEXT': 'string',
    'MULTI_LINE_TEXT': 'string',
    'RICH_TEXT': 'string',
    'LINK': 'string',
    'NUMBER': 'string',
    'CALC': 'string',
    'CHECK_BOX': 'string[]',
    'RADIO_BUTTON': 'string',
    'DROP_DOWN': 'string | null',
    'MULTI_SELECT': 'string[]',
    'DATE': 'string | null',
    'TIME': 'string | null',
    'DATETIME': 'string | null',
    'USER_SELECT': '{ code: string; name: string }[]',
    'ORGANIZATION_SELECT': '{ code: string; name: string }[]',
    'GROUP_SELECT': '{ code: string; name: string }[]',
    'CREATOR': '{ code: string; name: string }',
    'MODIFIER': '{ code: string; name: string }',
    'FILE': '{ contentType: string; fileKey: string; name: string; size: string }[]',
    'RECORD_NUMBER': 'string',
    'CREATED_TIME': 'string',
    'UPDATED_TIME': 'string',
    'STATUS': 'string',
    'STATUS_ASSIGNEE': '{ code: string; name: string }[]',
    'CATEGORY': 'string[]',
};
// 書き込み不可フィールド型（RecordInputから除外）
const READ_ONLY_TYPES = new Set([
    'RECORD_NUMBER', 'CREATED_TIME', 'UPDATED_TIME',
    'CREATOR', 'MODIFIER', 'CALC',
    'STATUS', 'STATUS_ASSIGNEE', 'CATEGORY',
]);
// SUBTABLEはスキップ対象として別管理
const SKIP_TYPES = new Set(['SUBTABLE', 'REFERENCE_TABLE']);
/**
 * kintone REST APIからフィールドスキーマを取得
 */
async function fetchSchema(client, appId) {
    const resp = await client.app.getFormFields({ app: appId });
    const fields = [];
    for (const [code, prop] of Object.entries(resp.properties)) {
        if (SKIP_TYPES.has(prop.type))
            continue;
        fields.push({ code, type: prop.type, label: prop.label ?? code });
    }
    // コード名でソート（安定した出力のため）
    fields.sort((a, b) => a.code.localeCompare(b.code));
    return fields;
}
/**
 * KintoneRestAPIClientを生成
 */
function createKintoneClient(profile) {
    const auth = {
        username: profile.username,
        password: profile.password,
    };
    const options = {
        baseUrl: profile.baseUrl,
        auth,
    };
    if (profile.basicUsername) {
        options.basicAuth = {
            username: profile.basicUsername,
            password: profile.basicPassword,
        };
    }
    return new KintoneRestAPIClient(options);
}
/**
 * PascalCase変換（alias → 型名プレフィックス）
 */
function toPascalCase(str) {
    return str
        .split(/[-_\s]+/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
}
// ===== テンプレート生成 =====
function genSharedResult() {
    return `// @generated - このファイルは自動生成されます。手動で編集しないでください。

export type ApiError = {
    code: string;
    message: string;
    details?: unknown;
    raw?: unknown;
};

export type Result<T> =
    | { success: true; data: T; errors: [] }
    | { success: false; data?: undefined; errors: ApiError[] };

export function ok<T>(data: T): Result<T> {
    return { success: true, data, errors: [] };
}

export function fail<T>(errors: ApiError[]): Result<T> {
    return { success: false, errors };
}

export function fromKintoneError(error: unknown): ApiError {
    if (error instanceof Error) {
        const kErr = error as any;
        return {
            code: kErr.code ?? 'UNKNOWN',
            message: kErr.message,
            details: kErr.errors,
            raw: error,
        };
    }
    return { code: 'UNKNOWN', message: String(error) };
}
`;
}
function genSharedClient() {
    return `// @generated - このファイルは自動生成されます。手動で編集しないでください。
import { KintoneRestAPIClient } from '@kintone/rest-api-client';

export type CreateClientConfig = {
    apiToken: string;
    baseUrl?: string;
};

export function createClient(config: CreateClientConfig): KintoneRestAPIClient {
    return new KintoneRestAPIClient({
        baseUrl: config.baseUrl,
        auth: { apiToken: config.apiToken },
    });
}
`;
}
function genTypes(alias, fields) {
    const typeName = toPascalCase(alias);
    const lines = [];
    lines.push('// @generated - このファイルは自動生成されます。手動で編集しないでください。');
    lines.push('');
    // Record型（読み取り用、システムフィールド含む）
    lines.push(`export interface ${typeName}Record {`);
    lines.push(`    $id: { type: '__ID__'; value: string };`);
    lines.push(`    $revision: { type: '__REVISION__'; value: string };`);
    for (const f of fields) {
        const valueType = FIELD_VALUE_TYPE[f.type] ?? 'string';
        lines.push(`    ${quoteFieldName(f.code)}: { type: '${f.type}'; value: ${valueType} };`);
    }
    lines.push('}');
    lines.push('');
    // RecordInput型（書き込み用、更新可能フィールドのみ）
    lines.push(`export interface ${typeName}RecordInput {`);
    for (const f of fields) {
        if (READ_ONLY_TYPES.has(f.type))
            continue;
        const valueType = FIELD_VALUE_TYPE[f.type] ?? 'string';
        lines.push(`    ${quoteFieldName(f.code)}?: { value: ${valueType} };`);
    }
    lines.push('}');
    lines.push('');
    return lines.join('\n');
}
function genOperations(alias) {
    const typeName = toPascalCase(alias);
    return `// @generated - このファイルは自動生成されます。手動で編集しないでください。
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import type { Result } from '../_shared/result.js';
import { ok, fail, fromKintoneError } from '../_shared/result.js';
import type { ${typeName}Record, ${typeName}RecordInput } from './types.js';

export function createOperations(client: KintoneRestAPIClient, appId: string) {
    return {
        async getRecord(id: string): Promise<Result<${typeName}Record>> {
            try {
                const resp = await client.record.getRecord({ app: appId, id });
                return ok(resp.record as unknown as ${typeName}Record);
            } catch (error) {
                return fail([fromKintoneError(error)]);
            }
        },

        async getRecords(query?: string): Promise<Result<${typeName}Record[]>> {
            try {
                const records = await client.record.getAllRecords({
                    app: appId,
                    condition: query,
                });
                return ok(records as unknown as ${typeName}Record[]);
            } catch (error) {
                return fail([fromKintoneError(error)]);
            }
        },

        async addRecord(record: ${typeName}RecordInput): Promise<Result<{ id: string; revision: string }>> {
            try {
                const resp = await client.record.addRecord({
                    app: appId,
                    record: record as any,
                });
                return ok({ id: resp.id, revision: resp.revision });
            } catch (error) {
                return fail([fromKintoneError(error)]);
            }
        },

        async updateRecord(id: string, record: ${typeName}RecordInput, revision?: number): Promise<Result<{ revision: string }>> {
            try {
                const resp = await client.record.updateRecord({
                    app: appId,
                    id,
                    record: record as any,
                    revision,
                });
                return ok({ revision: resp.revision });
            } catch (error) {
                return fail([fromKintoneError(error)]);
            }
        },

        async deleteRecords(ids: string[]): Promise<Result<void>> {
            try {
                await client.record.deleteRecords({
                    app: appId,
                    ids: ids.map(Number),
                });
                return ok(undefined as void);
            } catch (error) {
                return fail([fromKintoneError(error)]);
            }
        },
    };
}
`;
}
function genIndex(alias) {
    const typeName = toPascalCase(alias);
    return `// @generated - このファイルは自動生成されます。手動で編集しないでください。
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import { createClient } from '../_shared/client.js';
import { createOperations } from './operations.js';

export type { ${typeName}Record, ${typeName}RecordInput } from './types.js';

export type Create${typeName}ApiConfig = {
    appId: string;
    client?: KintoneRestAPIClient;
    apiToken?: string;
    baseUrl?: string;
};

export function create${typeName}Api(config: Create${typeName}ApiConfig) {
    if (!config.client && !config.apiToken) {
        throw new Error('create${typeName}Api: either "client" or "apiToken" must be provided.');
    }
    const client = config.client ?? createClient({ apiToken: config.apiToken!, baseUrl: config.baseUrl });
    return createOperations(client, config.appId);
}
`;
}
/**
 * フィールドコードに特殊文字が含まれる場合はクォートする
 */
function quoteFieldName(code) {
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(code)) {
        return code;
    }
    return `'${code.replace(/'/g, "\\'")}'`;
}
// ===== @generated ファイル検出・クリーン =====
const GENERATED_MARKER = '// @generated';
/**
 * outDir配下の@generatedファイルを再帰的に収集
 */
function collectGeneratedFiles(dir) {
    if (!fs.existsSync(dir))
        return [];
    const result = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectGeneratedFiles(fullPath));
        }
        else if (entry.isFile() && entry.name.endsWith('.ts')) {
            try {
                const firstLine = fs.readFileSync(fullPath, 'utf-8').split('\n')[0];
                if (firstLine.startsWith(GENERATED_MARKER)) {
                    result.push(fullPath);
                }
            }
            catch {
                // 読み取り不可はスキップ
            }
        }
    }
    return result;
}
/**
 * @generatedファイルのうち、今回生成されなかったものを削除
 * 空ディレクトリも再帰的に削除
 */
function cleanStaleFiles(outDir, generatedPaths, dryRun, verbose) {
    const existing = collectGeneratedFiles(outDir);
    const stale = existing.filter(f => !generatedPaths.has(path.resolve(f)));
    if (stale.length === 0) {
        if (verbose) {
            console.log(chalk.gray('  clean: no stale @generated files found.'));
        }
        return 0;
    }
    for (const file of stale) {
        if (dryRun) {
            console.log(chalk.yellow(`  [dry-run] would delete: ${file}`));
        }
        else {
            fs.removeSync(file);
            console.log(chalk.red(`  deleted: ${file}`));
        }
    }
    // 空ディレクトリの削除（dry-runでは実行しない）
    if (!dryRun) {
        removeEmptyDirs(outDir);
    }
    return stale.length;
}
/**
 * 空ディレクトリを再帰的に削除
 */
function removeEmptyDirs(dir) {
    if (!fs.existsSync(dir))
        return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            removeEmptyDirs(path.join(dir, entry.name));
        }
    }
    // 再度チェック（子ディレクトリが削除された後に空になっている可能性）
    if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
    }
}
// ===== prettier連携 =====
/**
 * prettierを動的にロードし、利用可能であれば返す
 */
async function loadPrettier() {
    try {
        return await import('prettier');
    }
    catch {
        return null;
    }
}
/**
 * 指定パスのファイルをprettierでフォーマット
 */
async function formatWithPrettier(prettier, filePaths, verbose) {
    for (const filePath of filePaths) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const formatted = await prettier.format(content, { parser: 'typescript', filepath: filePath });
            fs.writeFileSync(filePath, formatted);
        }
        catch (error) {
            if (verbose) {
                const msg = error instanceof Error ? error.message : String(error);
                console.log(chalk.gray(`  prettier skipped: ${filePath} (${msg})`));
            }
        }
    }
}
export async function generateApi(ctx) {
    const errors = [];
    let generated = 0;
    const writtenFiles = [];
    if (ctx.targets.length === 0) {
        return { success: true, generated: 0, errors: [] };
    }
    const outDir = ctx.targets[0].outDir;
    const sharedDir = path.join(outDir, '_shared');
    // _shared/ を先に1回だけ生成
    const resultPath = path.join(sharedDir, 'result.ts');
    const clientPath = path.join(sharedDir, 'client.ts');
    writtenFiles.push(path.resolve(resultPath), path.resolve(clientPath));
    if (!ctx.options.dryRun) {
        fs.mkdirSync(sharedDir, { recursive: true });
        fs.writeFileSync(resultPath, genSharedResult());
        fs.writeFileSync(clientPath, genSharedClient());
    }
    else {
        console.log(chalk.yellow(`  [dry-run] ${sharedDir}/result.ts`));
        console.log(chalk.yellow(`  [dry-run] ${sharedDir}/client.ts`));
    }
    for (const target of ctx.targets) {
        // profileが空文字の場合はエラー（スキーマ取得にはprofileが必須）
        if (!target.profile) {
            errors.push(`no profile specified for target "${target.alias}". use --profile or set defaults.profile in api.json.`);
            continue;
        }
        const profile = ctx.profiles[target.profile];
        if (!profile) {
            errors.push(`profile "${target.profile}" not found for target "${target.alias}".`);
            continue;
        }
        if (ctx.options.verbose) {
            console.log(chalk.gray(`fetching schema: ${target.alias} (appId: ${target.appId})...`));
        }
        let fields;
        try {
            const client = createKintoneClient(profile);
            fields = await fetchSchema(client, target.appId);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`failed to fetch schema for "${target.alias}" (appId: ${target.appId}): ${msg}`);
            continue;
        }
        if (ctx.options.verbose) {
            console.log(chalk.gray(`  fields: ${fields.length}`));
        }
        const aliasDir = path.join(target.outDir, target.alias);
        const typesPath = path.join(aliasDir, 'types.ts');
        const opsPath = path.join(aliasDir, 'operations.ts');
        const indexPath = path.join(aliasDir, 'index.ts');
        writtenFiles.push(path.resolve(typesPath), path.resolve(opsPath), path.resolve(indexPath));
        if (ctx.options.dryRun) {
            console.log(chalk.yellow(`  [dry-run] ${aliasDir}/types.ts (${fields.length} fields)`));
            console.log(chalk.yellow(`  [dry-run] ${aliasDir}/operations.ts`));
            console.log(chalk.yellow(`  [dry-run] ${aliasDir}/index.ts`));
            generated++;
            continue;
        }
        // alias/ を生成
        fs.mkdirSync(aliasDir, { recursive: true });
        fs.writeFileSync(typesPath, genTypes(target.alias, fields));
        fs.writeFileSync(opsPath, genOperations(target.alias));
        fs.writeFileSync(indexPath, genIndex(target.alias));
        console.log(chalk.green(`  generated: ${target.alias}/ (${fields.length} fields)`));
        generated++;
    }
    // --clean: 今回生成されなかった@generatedファイルを削除
    if (ctx.options.clean) {
        const generatedSet = new Set(writtenFiles);
        const deleted = cleanStaleFiles(outDir, generatedSet, ctx.options.dryRun, ctx.options.verbose);
        if (deleted > 0 && !ctx.options.dryRun) {
            console.log(chalk.cyan(`  cleaned: ${deleted} stale file(s)`));
        }
    }
    // prettier: 生成ファイルをフォーマット
    if (ctx.options.prettier && !ctx.options.dryRun && writtenFiles.length > 0) {
        const prettier = await loadPrettier();
        if (prettier) {
            if (ctx.options.verbose) {
                console.log(chalk.gray('  formatting with prettier...'));
            }
            await formatWithPrettier(prettier, writtenFiles, ctx.options.verbose);
        }
        else if (ctx.options.verbose) {
            console.log(chalk.gray('  prettier not found, skipping format.'));
        }
    }
    return { success: errors.length === 0, generated, errors };
}
