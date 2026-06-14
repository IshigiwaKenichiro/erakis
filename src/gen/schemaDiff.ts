// スキーマ差分の計算（純粋関数群）
import { createPatch } from 'diff';

// システムフィールドは同期対象外
const SYSTEM_TYPES = new Set([
    'RECORD_NUMBER', 'CREATOR', 'CREATED_TIME', 'MODIFIER', 'UPDATED_TIME',
    'STATUS', 'STATUS_ASSIGNEE', 'CATEGORY',
]);

// diff比較でスキップするプロパティ（構造的な情報ではなくメタ情報）
// noLabel は UI 表示に意味があるため diff 対象に含める
const SKIP_DIFF_PROPS = new Set(['code']);

// property diff で大きすぎると判断する JSON 文字数閾値
const LARGE_PROP_THRESHOLD = 150;

export type DiffCategory = 'add' | 'update' | 'delete' | 'type-change';

export type FieldDiff = {
    category: DiffCategory;
    code: string;
    fromType?: string;
    toType?: string;
    changedProps?: string[];
    fromField?: Record<string, unknown>;
    toField?: Record<string, unknown>;
};

export type DiffResult = {
    add: FieldDiff[];
    update: FieldDiff[];
    delete: FieldDiff[];
    typeChange: FieldDiff[];
};

/**
 * 2つのフィールド定義を比較して差分を返す純粋関数。
 * from → to に変換する操作の分類。
 */
export function diffSchemas(
    fromFields: Record<string, any>,
    toFields: Record<string, any>,
): DiffResult {
    const result: DiffResult = { add: [], update: [], delete: [], typeChange: [] };

    const allCodes = [...new Set([...Object.keys(fromFields), ...Object.keys(toFields)])].sort();

    for (const code of allCodes) {
        const from = fromFields[code];
        const to = toFields[code];

        // どちらかがシステムフィールド型ならスキップ
        if ((from && SYSTEM_TYPES.has(from.type)) || (to && SYSTEM_TYPES.has(to.type))) continue;

        if (!from && to) {
            // toにあってfromにない → fromに追加が必要
            result.add.push({ category: 'add', code, toType: to.type, toField: to });
        } else if (from && !to) {
            // fromにあってtoにない → fromから削除が必要
            result.delete.push({ category: 'delete', code, fromType: from.type, fromField: from });
        } else if (from.type !== to.type) {
            // 型が変わった → delete→addの2段が必要、データ消失を伴う
            result.typeChange.push({
                category: 'type-change',
                code,
                fromType: from.type,
                toType: to.type,
                fromField: from,
                toField: to,
            });
        } else {
            // 同一型 → プロパティ差分を確認
            const changedProps = findChangedProps(from, to);
            if (changedProps.length > 0) {
                result.update.push({
                    category: 'update',
                    code,
                    fromType: from.type,
                    fromField: from,
                    toField: to,
                    changedProps,
                });
            }
        }
    }

    return result;
}

function findChangedProps(from: Record<string, unknown>, to: Record<string, unknown>): string[] {
    const allProps = new Set([...Object.keys(from), ...Object.keys(to)]);
    const changed: string[] = [];
    for (const prop of allProps) {
        if (SKIP_DIFF_PROPS.has(prop)) continue;
        if (JSON.stringify(from[prop]) !== JSON.stringify(to[prop])) {
            changed.push(prop);
        }
    }
    return changed.sort();
}

/**
 * DiffResult をプレーンテキストに整形する。
 * fromFields / toFields を渡すと update 差分に property-level の詳細が付く。
 * 行頭記号で chalk カラー適用が可能: + = add, ~ = update, - = delete, ! = type-change
 */
export function formatDiffSummary(
    result: DiffResult,
    fromLabel: string,
    toLabel: string,
    appName = '',
    fromFields?: Record<string, any>,
    toFields?: Record<string, any>,
): string {
    const lines: string[] = [`差分: ${fromLabel} → ${toLabel}`, ''];

    const total = result.add.length + result.update.length + result.delete.length + result.typeChange.length;
    if (total === 0) {
        lines.push('差分なし。');
        return lines.join('\n');
    }

    lines.push(`追加: ${result.add.length}件 / 変更: ${result.update.length}件 / 削除: ${result.delete.length}件 / 型変更: ${result.typeChange.length}件`);
    lines.push('');

    if (result.add.length > 0) {
        lines.push('## 追加 (add)');
        for (const d of result.add) {
            lines.push(`  + ${d.code} [${d.toType}]`);
        }
        lines.push('');
    }

    if (result.update.length > 0) {
        lines.push('## 変更 (update)');
        for (const d of result.update) {
            lines.push(`  ~ ${d.code} [${d.fromType}]`);
            if (fromFields && toFields && d.changedProps && d.changedProps.length > 0) {
                const fromField = fromFields[d.code] ?? d.fromField ?? {};
                const toField = toFields[d.code] ?? d.toField ?? {};
                for (const prop of d.changedProps) {
                    const devVal = (fromField as any)[prop];
                    const prodVal = (toField as any)[prop];
                    lines.push(`    ${prop}:`);
                    const devJson = JSON.stringify(devVal, null, 2);
                    const prodJson = JSON.stringify(prodVal, null, 2);
                    if (devJson.length > LARGE_PROP_THRESHOLD || prodJson.length > LARGE_PROP_THRESHOLD) {
                        const hint = Array.isArray(devVal)
                            ? `${(devVal as unknown[]).length}件`
                            : typeof devVal === 'object' && devVal !== null
                            ? 'object'
                            : '';
                        lines.push(`      変更あり${hint ? ` (${hint})` : ''}`);
                        lines.push(`      詳細は --full で確認できます`);
                    } else if (devJson.includes('\n') || prodJson.includes('\n')) {
                        lines.push(`      dev:`);
                        for (const l of devJson.split('\n')) lines.push(`        ${l}`);
                        lines.push(`      prod:`);
                        for (const l of prodJson.split('\n')) lines.push(`        ${l}`);
                    } else {
                        lines.push(`      dev: ${devJson}`);
                        lines.push(`      prod: ${prodJson}`);
                    }
                }
            } else {
                lines.push(`      変更: ${d.changedProps?.join(', ')}`);
            }
        }
        lines.push('');
    }

    if (result.delete.length > 0) {
        lines.push('## 削除 (delete) ※確認プロンプト必須');
        for (const d of result.delete) {
            lines.push(`  - ${d.code} [${d.fromType}]`);
        }
        lines.push('');
    }

    if (result.typeChange.length > 0) {
        lines.push('## 型変更 ⚠  delete→add の2段が必要。既存データが消える');
        for (const d of result.typeChange) {
            lines.push(`  ! ${d.code} [${d.fromType}] → [${d.toType}]`);
        }
        lines.push('');
    }

    const actionable = [
        ...( result.add.length > 0        ? [`  追加が必要: ${result.add.map(d => d.code).join(', ')}`] : [] ),
        ...( result.update.length > 0     ? [`  変更が必要: ${result.update.map(d => d.code).join(', ')}`] : [] ),
        ...( result.typeChange.length > 0 ? [`  型変更が必要 (⚠ データ消失): ${result.typeChange.map(d => d.code).join(', ')}`] : [] ),
        ...( result.delete.length > 0     ? [`  削除が必要: ${result.delete.map(d => d.code).join(', ')}`] : [] ),
    ];
    if (actionable.length > 0) {
        lines.push('## 次のステップ');
        lines.push(...actionable);
    }

    return lines.join('\n');
}

/**
 * --full 用: 変更のあった各フィールドの normalized JSON unified diff を生成する。
 */
export function formatFullDiff(
    fromFields: Record<string, any>,
    toFields: Record<string, any>,
    result: DiffResult,
): string {
    const sections: string[] = [];

    const allChanged = [
        ...result.update,
        ...result.typeChange,
        ...result.add,
        ...result.delete,
    ].sort((a, b) => a.code.localeCompare(b.code));

    for (const d of allChanged) {
        const fromField = fromFields[d.code];
        const toField = toFields[d.code];

        const fromJson = fromField ? normalizeFieldJson(fromField) + '\n' : '';
        const toJson = toField ? normalizeFieldJson(toField) + '\n' : '';

        const patch = createPatch(
            d.code,
            fromJson,
            toJson,
            'dev',
            'prod',
        );

        // ヘッダー2行 (--- / +++) を除いてフィールド名セクションとして出力
        const patchLines = patch.split('\n').slice(2).join('\n');
        sections.push(`## Fields / ${d.code} [${d.fromType ?? d.toType}]`);
        sections.push(patchLines);
    }

    return sections.join('\n');
}

function normalizeFieldJson(field: Record<string, any>): string {
    const { code: _code, ...rest } = field;
    return JSON.stringify(sortObjectKeys(rest), null, 2);
}

function sortObjectKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) return (obj as unknown[]).map(sortObjectKeys);
    if (typeof obj !== 'object' || obj === null) return obj;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object).sort()) {
        sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
}
