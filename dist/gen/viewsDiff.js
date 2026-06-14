import { createPatch } from 'diff';
function normalizeView(view) {
    const { id: _id, ...rest } = view;
    return rest;
}
function findChangedProps(dev, prod) {
    const allKeys = new Set([...Object.keys(dev), ...Object.keys(prod)]);
    const changed = [];
    for (const key of [...allKeys].sort()) {
        if (JSON.stringify(dev[key]) !== JSON.stringify(prod[key])) {
            changed.push(key);
        }
    }
    return changed;
}
/**
 * dev と prod のビューを比較して構造化された差分を返す純粋関数。
 * API 呼び出しなし。kintone 固有の `id` プロパティは比較対象外。
 * 結果はビュー名でソートされる。
 * @param devViews  - dev 環境のビューマップ
 * @param prodViews - prod 環境のビューマップ
 * @returns add/delete/change リストを持つ ViewsDiffResult
 */
export function diffViews(devViews, prodViews) {
    const devNames = new Set(Object.keys(devViews));
    const prodNames = new Set(Object.keys(prodViews));
    const add = [...prodNames].filter(n => !devNames.has(n)).sort();
    const del = [...devNames].filter(n => !prodNames.has(n)).sort();
    const change = [];
    for (const name of [...devNames].filter(n => prodNames.has(n)).sort()) {
        const changedProps = findChangedProps(normalizeView(devViews[name]), normalizeView(prodViews[name]));
        if (changedProps.length > 0)
            change.push({ name, changedProps });
    }
    return { add, delete: del, change };
}
/**
 * ViewsDiffResult を簡潔な人間可読テキストに整形する純粋関数。
 * 差分がない場合は 'Views 差分なし' を返す。
 * 追加/削除/変更の行頭に +/-/~ のプレフィックスを付ける。
 */
export function formatViewsDiffReport(result) {
    const total = result.add.length + result.delete.length + result.change.length;
    if (total === 0)
        return 'Views 差分なし';
    const lines = [
        `## Views diff: 追加 ${result.add.length}件 / 削除 ${result.delete.length}件 / 変更 ${result.change.length}件`,
    ];
    for (const name of result.add)
        lines.push(`  + ${name}`);
    for (const name of result.delete)
        lines.push(`  - ${name}`);
    for (const { name, changedProps } of result.change)
        lines.push(`  ~ ${name} (${changedProps.join(', ')})`);
    return lines.join('\n');
}
/**
 * 正規化した dev vs prod ビュー JSON の unified diff を生成する（--full 用）。
 * kintone 固有の `id` フィールドを除外し、ビュー名でソートしてから diff を生成する。
 * 正規化後に同一であれば空文字を返す。副作用なし。
 */
export function formatFullViewsDiff(devViews, prodViews) {
    const normalize = (views) => JSON.stringify(Object.fromEntries(Object.keys(views).sort().map(k => [k, normalizeView(views[k])])), null, 2);
    const devStr = normalize(devViews);
    const prodStr = normalize(prodViews);
    if (devStr === prodStr)
        return '';
    return createPatch('views', devStr, prodStr, 'live(dev)', 'live(prod)');
}
