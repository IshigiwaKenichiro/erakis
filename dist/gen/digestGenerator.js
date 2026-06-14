// kintoneフィールドスキーマのダイジェスト生成（純粋関数群）
// layout ROW.fields に出現するフィールド以外の要素型
const NON_FIELD_LAYOUT_TYPES = new Set(['SPACER', 'LABEL', 'HR']);
function buildLayoutMaps(layout) {
    const groupMap = new Map();
    const spacers = [];
    function processRows(rows, currentGroup) {
        for (const row of rows) {
            if (row.type !== 'ROW')
                continue;
            for (const field of (row.fields ?? [])) {
                if (field.type === 'SPACER' && field.elementId) {
                    spacers.push({ elementId: field.elementId, group: currentGroup });
                }
                else if (field.code && !NON_FIELD_LAYOUT_TYPES.has(field.type) && currentGroup) {
                    // 実 kintone レスポンスでは type は 'NUMBER'/'SINGLE_LINE_TEXT' 等の実フィールド型
                    groupMap.set(field.code, currentGroup);
                }
            }
        }
    }
    for (const item of layout) {
        if (item.type === 'ROW') {
            for (const field of (item.fields ?? [])) {
                if (field.type === 'SPACER' && field.elementId) {
                    spacers.push({ elementId: field.elementId });
                }
            }
        }
        else if (item.type === 'GROUP') {
            const groupLabel = item.label ?? item.code ?? '';
            processRows(item.layout ?? [], groupLabel);
        }
    }
    return { groupMap, spacers };
}
/**
 * layout から GROUP所属マップと SPACER一覧を抽出する（schema digest/docs コマンド向け）
 */
export function extractLayoutInfo(layout) {
    const { groupMap, spacers } = buildLayoutMaps(layout);
    return { fieldGroups: groupMap, spacers };
}
function buildFieldRow(code, field, groupMap) {
    const noteParts = [];
    const group = groupMap.get(code);
    if (group)
        noteParts.push(`group: ${group}`);
    // 選択肢 (DROP_DOWN / RADIO_BUTTON / CHECK_BOX / MULTI_SELECT)
    if (field.options && typeof field.options === 'object') {
        const opts = Object.values(field.options);
        opts.sort((a, b) => {
            const ai = typeof a.index === 'string' ? parseInt(a.index, 10) : (a.index ?? 0);
            const bi = typeof b.index === 'string' ? parseInt(b.index, 10) : (b.index ?? 0);
            return ai - bi;
        });
        const labels = opts.map((o) => o.label);
        if (labels.length > 0)
            noteParts.push(`選択肢: ${labels.join(', ')}`);
    }
    // expression (CALC / SINGLE_LINE_TEXT 等でも存在する)
    if (field.expression)
        noteParts.push(`expression: ${field.expression}`);
    // lookup
    if (field.lookup) {
        const lu = field.lookup;
        const relApp = lu.relatedApp?.app ?? '?';
        const relKey = lu.relatedKeyField ?? '?';
        const copyCount = Array.isArray(lu.fieldMappings) ? lu.fieldMappings.length : 0;
        noteParts.push(`lookup → app ${relApp} . ${relKey}（コピー: ${copyCount}件）`);
    }
    // unique
    if (field.unique === true || field.unique === 'true')
        noteParts.push('unique');
    // defaultValue
    if (field.defaultValue !== undefined && field.defaultValue !== '' && field.defaultValue !== null) {
        const dv = Array.isArray(field.defaultValue)
            ? field.defaultValue.join(', ')
            : String(field.defaultValue);
        if (dv)
            noteParts.push(`defaultValue: ${dv}`);
    }
    return {
        code,
        type: field.type ?? '',
        label: field.label ?? '',
        required: field.required === true || field.required === 'true',
        notes: noteParts.join(' / '),
        isSubtableChild: false,
        isSpacer: false,
    };
}
/**
 * fields.json + layout.json から DigestRow[] を生成する純粋関数
 */
export function schemaToDigestRows(fields, layout) {
    const { groupMap, spacers } = buildLayoutMaps(layout);
    const rows = [];
    const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [code, field] of entries) {
        const row = buildFieldRow(code, field, groupMap);
        rows.push(row);
        // SUBTABLEの子フィールドを親直下に展開（コード順）
        if (field.type === 'SUBTABLE' && field.fields) {
            const children = Object.entries(field.fields).sort(([a], [b]) => a.localeCompare(b));
            for (const [childCode, childField] of children) {
                const childRow = buildFieldRow(childCode, childField, groupMap);
                childRow.isSubtableChild = true;
                childRow.parentTable = code;
                childRow.notes = childRow.notes ? `in: ${code} / ${childRow.notes}` : `in: ${code}`;
                rows.push(childRow);
            }
        }
    }
    // SPACERをelementId昇順で末尾に追加（決定的出力）
    const sortedSpacers = [...spacers].sort((a, b) => a.elementId.localeCompare(b.elementId));
    for (const spacer of sortedSpacers) {
        const noteParts = [`elementId: ${spacer.elementId}`];
        if (spacer.group)
            noteParts.push(`group: ${spacer.group}`);
        rows.push({
            code: '(spacer)',
            type: 'SPACER',
            label: '',
            required: false,
            notes: noteParts.join(' / '),
            isSubtableChild: false,
            isSpacer: true,
        });
    }
    return rows;
}
function escapeMd(value) {
    return value.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\|/g, '\\|');
}
function escapeTsv(value) {
    return value.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\t/g, ' ');
}
/**
 * DigestRow[] → Markdownテーブル文字列
 */
export function formatDigestMarkdown(rows, meta) {
    const envTag = meta.environment === 'prod' ? 'prod' : meta.environment === 'raw' ? 'raw' : 'dev';
    const fieldCount = rows.filter(r => !r.isSpacer).length;
    const digestRef = meta.digestAppRef ?? meta.appName;
    const lines = [
        `# ${meta.appName} (app: ${meta.appId}, ${envTag}, revision: ${meta.revision}) フィールドダイジェスト`,
        '',
        `> generated by \`erakis schema digest\` / ${fieldCount} fields`,
        `> 再生成: \`npx erakis schema digest --app ${digestRef}\``,
        `> spaceId: ${meta.spaceId || '(none)'} / isGuestSpace: ${meta.isGuestSpace}`,
        '',
        '| コード | 型 | ラベル | 必須 | 備考 |',
        '|---|---|---|---|---|',
    ];
    for (const row of rows) {
        const code = escapeMd(row.isSubtableChild ? `└ ${row.code}` : row.code);
        const label = escapeMd(row.label);
        const notes = escapeMd(row.notes);
        const required = row.required ? '✓' : '';
        lines.push(`| ${code} | ${row.type} | ${label} | ${required} | ${notes} |`);
    }
    lines.push('');
    return lines.join('\n');
}
/**
 * DigestRow[] → TSV文字列
 */
export function formatDigestTsv(rows, meta) {
    const lines = [
        `# spaceId: ${meta.spaceId || '(none)'} / isGuestSpace: ${meta.isGuestSpace}`,
        'コード\t型\tラベル\t必須\t備考',
    ];
    for (const row of rows) {
        const code = escapeTsv(row.isSubtableChild ? `└ ${row.code}` : row.code);
        const label = escapeTsv(row.label);
        const notes = escapeTsv(row.notes);
        const required = row.required ? '✓' : '';
        lines.push(`${code}\t${row.type}\t${label}\t${required}\t${notes}`);
    }
    lines.push('');
    return lines.join('\n');
}
