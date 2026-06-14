// レイアウト差分の計算（純粋関数群）
import { createPatch } from 'diff';
// ---- 要素抽出 ----
function kindOf(item) {
    switch (item.type) {
        case 'SPACER': return 'spacer';
        case 'LABEL': return 'label';
        case 'HR': return 'hr';
        case 'GROUP': return 'group';
        case 'SUBTABLE': return 'subtable';
        default: return 'field';
    }
}
function makeKey(item) {
    switch (item.type) {
        case 'SPACER': return `spacer:${item.elementId ?? simpleHash(JSON.stringify(item))}`;
        case 'LABEL': return `label:${item.elementId ?? simpleHash(item.label ?? '')}`;
        case 'HR': return `hr:${item.elementId ?? 'hr'}`;
        case 'GROUP': return `group:${item.code}`;
        case 'SUBTABLE': return `subtable:${item.code}`;
        default: return `field:${item.code}`;
    }
}
function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16);
}
/**
 * kintone layout 配列を LayoutElement のフラットリストへ変換する純粋関数。
 * ROW/GROUP/SUBTABLE を走査し、各アイテムに行/列/グループ情報を付与する。
 * elementId なし HR/LABEL/SPACER が複数ある場合はキーに出現インデックスを付与して衝突を防ぐ。
 * SUBTABLE 子フィールドは parentTable メタデータ付きで展開する。
 */
export function flattenLayout(layout) {
    const elements = [];
    const keyCounts = new Map();
    function addElem(item, row, col, opts) {
        const baseKey = makeKey(item);
        const n = keyCounts.get(baseKey) ?? 0;
        keyCounts.set(baseKey, n + 1);
        const key = n === 0 ? baseKey : `${baseKey}:${n}`;
        elements.push({ kind: kindOf(item), key, row, col, ...(opts ?? {}), raw: item });
    }
    for (let rowIdx = 0; rowIdx < layout.length; rowIdx++) {
        const item = layout[rowIdx];
        if (item.type === 'ROW') {
            const fields = item.fields ?? [];
            for (let colIdx = 0; colIdx < fields.length; colIdx++) {
                addElem(fields[colIdx], rowIdx, colIdx);
            }
        }
        else if (item.type === 'GROUP') {
            addElem(item, rowIdx, 0);
            const innerLayout = item.layout ?? [];
            for (let innerRowIdx = 0; innerRowIdx < innerLayout.length; innerRowIdx++) {
                const innerRow = innerLayout[innerRowIdx];
                if (innerRow.type !== 'ROW')
                    continue;
                const innerFields = innerRow.fields ?? [];
                for (let colIdx = 0; colIdx < innerFields.length; colIdx++) {
                    addElem(innerFields[colIdx], rowIdx, colIdx, {
                        innerRow: innerRowIdx,
                        innerCol: colIdx,
                        group: item.code,
                    });
                }
            }
        }
        else if (item.type === 'SUBTABLE') {
            addElem(item, rowIdx, 0);
            // API は {[code]: {...}} オブジェクト形式。テスト用に配列形式も受け付ける
            const rawFields = item.fields ?? {};
            const childFields = Array.isArray(rawFields)
                ? rawFields
                : Object.entries(rawFields).map(([code, f]) => ({ code, ...f }));
            for (let colIdx = 0; colIdx < childFields.length; colIdx++) {
                addElem(childFields[colIdx], rowIdx, colIdx, { parentTable: item.code });
            }
        }
    }
    return elements;
}
// ---- 差分検出 ----
function samePosition(dev, prod) {
    return dev.row === prod.row &&
        dev.col === prod.col &&
        dev.group === prod.group &&
        dev.innerRow === prod.innerRow &&
        dev.innerCol === prod.innerCol &&
        dev.parentTable === prod.parentTable;
}
function comparableContent(elem) {
    const raw = elem.raw;
    if (elem.kind === 'group') {
        const { layout: _l, ...rest } = raw;
        return sortObjKeys(rest);
    }
    if (elem.kind === 'subtable') {
        const { fields: _f, ...rest } = raw;
        return sortObjKeys(rest);
    }
    return sortObjKeys(raw);
}
function sortObjKeys(obj) {
    if (Array.isArray(obj))
        return obj.map(sortObjKeys);
    if (typeof obj !== 'object' || obj === null)
        return obj;
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjKeys(obj[key]);
    }
    return sorted;
}
/**
 * 2つの kintone layout 配列を比較し差分を返す純粋関数。
 * 同一 key が両方にあり位置が違えば move、内容が違えば change として分類する。
 */
export function diffLayouts(devLayout, prodLayout) {
    const result = { add: [], delete: [], move: [], change: [] };
    const devElems = flattenLayout(devLayout);
    const prodElems = flattenLayout(prodLayout);
    const devMap = new Map(devElems.map(e => [e.key, e]));
    const prodMap = new Map(prodElems.map(e => [e.key, e]));
    const allKeys = [...new Set([...devMap.keys(), ...prodMap.keys()])];
    for (const key of allKeys) {
        const dev = devMap.get(key);
        const prod = prodMap.get(key);
        if (!dev && prod) {
            result.add.push({ category: 'add', key, kind: prod.kind, prodElem: prod });
        }
        else if (dev && !prod) {
            result.delete.push({ category: 'delete', key, kind: dev.kind, devElem: dev });
        }
        else if (dev && prod) {
            if (!samePosition(dev, prod)) {
                result.move.push({ category: 'move', key, kind: dev.kind, devElem: dev, prodElem: prod });
            }
            if (JSON.stringify(comparableContent(dev)) !== JSON.stringify(comparableContent(prod))) {
                result.change.push({ category: 'change', key, kind: dev.kind, devElem: dev, prodElem: prod });
            }
        }
    }
    return result;
}
// ---- フォーマット ----
function positionStr(elem) {
    if (elem.group) {
        return `row ${elem.row}, group: ${elem.group}, inner-row ${elem.innerRow ?? 0}, col ${elem.col}`;
    }
    if (elem.parentTable) {
        return `row ${elem.row}, subtable: ${elem.parentTable}, col ${elem.col}`;
    }
    return `row ${elem.row}, col ${elem.col}`;
}
function extraDesc(elem) {
    const r = elem.raw;
    if (elem.kind === 'label' && r.label)
        return `, text: "${r.label}"`;
    if (elem.kind === 'spacer' && r.elementId)
        return `, elementId: "${r.elementId}"`;
    return '';
}
/**
 * LayoutDiffResult をプレーンテキストに整形する。
 * 行頭の記号で chalk カラー適用が可能: + = add, - = delete, ~ = move/change
 */
export function formatLayoutDiffReport(result) {
    const lines = [];
    const total = result.add.length + result.delete.length + result.move.length + result.change.length;
    if (total === 0) {
        lines.push('Layout 差分なし。');
        return lines.join('\n');
    }
    lines.push(`Layout: 追加 ${result.add.length}件 / 削除 ${result.delete.length}件 / 移動 ${result.move.length}件 / 変更 ${result.change.length}件`);
    lines.push('');
    if (result.add.length > 0) {
        lines.push('## Layout 追加 (add)');
        for (const d of result.add) {
            lines.push(`  + ${d.key} [${d.kind}]`);
            if (d.prodElem)
                lines.push(`    prod: ${positionStr(d.prodElem)}${extraDesc(d.prodElem)}`);
        }
        lines.push('');
    }
    if (result.delete.length > 0) {
        lines.push('## Layout 削除 (delete)');
        for (const d of result.delete) {
            lines.push(`  - ${d.key} [${d.kind}]`);
            if (d.devElem)
                lines.push(`    dev: ${positionStr(d.devElem)}${extraDesc(d.devElem)}`);
        }
        lines.push('');
    }
    if (result.move.length > 0) {
        lines.push('## Layout 移動 (move)');
        for (const d of result.move) {
            lines.push(`  ~ ${d.key} [${d.kind}] moved`);
            if (d.devElem)
                lines.push(`    dev: ${positionStr(d.devElem)}`);
            if (d.prodElem)
                lines.push(`    prod: ${positionStr(d.prodElem)}`);
        }
        lines.push('');
    }
    if (result.change.length > 0) {
        lines.push('## Layout 変更 (change)');
        for (const d of result.change) {
            lines.push(`  ~ ${d.key} [${d.kind}] changed`);
            if (d.devElem && d.prodElem) {
                const devJson = JSON.stringify(comparableContent(d.devElem));
                const prodJson = JSON.stringify(comparableContent(d.prodElem));
                if (devJson.length < 200 && prodJson.length < 200) {
                    lines.push(`    dev: ${devJson}`);
                    lines.push(`    prod: ${prodJson}`);
                }
                else {
                    lines.push(`    変更あり (詳細は --full で確認)`);
                }
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}
/**
 * --full 用: 正規化 layout JSON の unified diff を生成する。
 * layout は順序が意味を持つため配列順は保持する。
 */
export function formatFullLayoutDiff(devLayout, prodLayout) {
    const devJson = JSON.stringify(sortObjKeys(devLayout), null, 2) + '\n';
    const prodJson = JSON.stringify(sortObjKeys(prodLayout), null, 2) + '\n';
    if (devJson === prodJson)
        return '';
    const patch = createPatch('layout.json', devJson, prodJson, 'dev', 'prod');
    return patch.split('\n').slice(2).join('\n');
}
