// スキーマ書き込み系ユーティリティ（純粋関数 + API呼び出しヘルパー）
import { diffSchemas } from '../gen/schemaDiff.js';
// ---- 純粋関数群（テスト可能） ----
/**
 * customizations から dev appId → prod appId へのマップを構築する純粋関数
 */
export function buildDevToProdMap(customizations) {
    const map = new Map();
    for (const custom of Object.values(customizations)) {
        const devId = custom.development?.appId;
        const prodId = custom.production?.appId;
        if (devId && prodId && devId !== prodId) {
            map.set(devId, prodId);
        }
    }
    return map;
}
/**
 * fields の lookup / REFERENCE_TABLE の relatedApp.app を dev→prod に置換する純粋関数。
 * prod 環境への push 時に呼び出す。
 */
export function remapLookupAppIds(fields, devToProdMap) {
    const remapped = JSON.parse(JSON.stringify(fields));
    const mappedCodes = [];
    const unmappedCodes = [];
    for (const [code, field] of Object.entries(remapped)) {
        const f = field;
        // lookup
        if (f.lookup?.relatedApp?.app) {
            const relId = String(f.lookup.relatedApp.app);
            const prodId = devToProdMap.get(relId);
            if (prodId) {
                f.lookup.relatedApp.app = prodId;
                mappedCodes.push(code);
            }
            else {
                unmappedCodes.push(code);
            }
        }
        // REFERENCE_TABLE
        if (f.type === 'REFERENCE_TABLE' && f.referenceTable?.relatedApp?.app) {
            const relId = String(f.referenceTable.relatedApp.app);
            const prodId = devToProdMap.get(relId);
            if (prodId) {
                f.referenceTable.relatedApp.app = prodId;
                if (!mappedCodes.includes(code))
                    mappedCodes.push(code);
            }
            else {
                if (!unmappedCodes.includes(code))
                    unmappedCodes.push(code);
            }
        }
        // SUBTABLE 子フィールドの lookup / REFERENCE_TABLE も再帰的にリマップ
        if (f.type === 'SUBTABLE' && f.fields) {
            for (const [childCode, childField] of Object.entries(f.fields)) {
                const cf = childField;
                if (cf.lookup?.relatedApp?.app) {
                    const relId = String(cf.lookup.relatedApp.app);
                    const prodId = devToProdMap.get(relId);
                    if (prodId) {
                        cf.lookup.relatedApp.app = prodId;
                        if (!mappedCodes.includes(childCode))
                            mappedCodes.push(childCode);
                    }
                    else {
                        if (!unmappedCodes.includes(childCode))
                            unmappedCodes.push(childCode);
                    }
                }
                if (cf.type === 'REFERENCE_TABLE' && cf.referenceTable?.relatedApp?.app) {
                    const relId = String(cf.referenceTable.relatedApp.app);
                    const prodId = devToProdMap.get(relId);
                    if (prodId) {
                        cf.referenceTable.relatedApp.app = prodId;
                        if (!mappedCodes.includes(childCode))
                            mappedCodes.push(childCode);
                    }
                    else {
                        if (!unmappedCodes.includes(childCode))
                            unmappedCodes.push(childCode);
                    }
                }
            }
        }
    }
    return { remapped, mappedCodes, unmappedCodes };
}
/**
 * layout 内のフィールドコードが fields に存在するか検証する純粋関数。
 * 不正なコードの配列を返す（空 = OK）。
 */
export function validateLayoutCodes(layout, fields) {
    // 全フィールドコードを収集（SUBTABLE 子も含む）
    const allCodes = new Set(Object.keys(fields));
    for (const field of Object.values(fields)) {
        if (field.type === 'SUBTABLE' && field.fields) {
            for (const childCode of Object.keys(field.fields)) {
                allCodes.add(childCode);
            }
        }
    }
    const invalid = [];
    const NON_FIELD_TYPES = new Set(['SPACER', 'LABEL', 'HR', 'SUBTABLE']);
    function checkRow(row) {
        if (row.type !== 'ROW')
            return;
        for (const f of (row.fields ?? [])) {
            if (f.code && !NON_FIELD_TYPES.has(f.type) && !allCodes.has(f.code)) {
                invalid.push(f.code);
            }
        }
    }
    for (const item of layout) {
        if (item.type === 'ROW') {
            checkRow(item);
        }
        else if (item.type === 'GROUP') {
            for (const row of (item.layout ?? [])) {
                checkRow(row);
            }
        }
        else if (item.type === 'SUBTABLE') {
            // SUBTABLE コード本体の検証
            if (item.code && !allCodes.has(item.code)) {
                invalid.push(item.code);
            }
            // SUBTABLE 内フィールド列（type:'SUBTABLE' の fields は ROW.fields 形式）
            for (const f of (item.fields ?? [])) {
                if (f.code && !NON_FIELD_TYPES.has(f.type) && !allCodes.has(f.code)) {
                    invalid.push(f.code);
                }
            }
        }
    }
    return [...new Set(invalid)];
}
/**
 * getViews 由来の views から app 固有 id を除去する純粋関数。
 * 別 appId の production へ push する際に dev 側 view id を持ち越さないための sanitize。
 */
export function sanitizeViewsForUpdate(views) {
    const result = {};
    for (const [name, view] of Object.entries(views)) {
        const { id: _id, ...rest } = view;
        result[name] = rest;
    }
    return result;
}
// ---- deploy / revision API ヘルパー（副作用あり） ----
const DEPLOY_POLL_INTERVAL_MS = 2000;
const DEPLOY_TIMEOUT_MS = 120_000;
/**
 * deployApp を呼び出して SUCCESS になるまでポーリングする。
 * revert: true を指定すると preview の変更を破棄して live 状態に戻す（undeploy）。
 * FAIL/CANCEL/タイムアウトは Error をスローする。
 */
export async function deployAndWait(client, appId, revision, options) {
    const appParam = { app: appId };
    if (revision != null)
        appParam.revision = String(revision);
    const deployOptions = { apps: [appParam] };
    if (options?.revert)
        deployOptions.revert = true;
    await client.app.deployApp(deployOptions);
    const start = Date.now();
    while (true) {
        await sleep(DEPLOY_POLL_INTERVAL_MS);
        const resp = await client.app.getDeployStatus({ apps: [appId] });
        const entry = resp.apps?.find((a) => String(a.app) === String(appId));
        if (!entry)
            throw new Error(`deploy status not found for app ${appId}`);
        if (entry.status === 'SUCCESS')
            return;
        if (entry.status === 'FAIL')
            throw new Error(`deploy FAIL for app ${appId}`);
        if (entry.status === 'CANCEL')
            throw new Error(`deploy CANCEL for app ${appId}`);
        if (Date.now() - start > DEPLOY_TIMEOUT_MS)
            throw new Error(`deploy timeout for app ${appId}`);
    }
}
/**
 * getDeployStatus レスポンスの apps 配列を人間可読テキストに変換する純粋関数。
 * PROCESSING 以外は divergence（スキーマ実比較結果）を主軸に出力し、
 * raw status は [deployStatus: STATUS] として末尾に付与する。
 */
export function formatDeployStatus(entries) {
    return entries.map(e => {
        const rawTag = `[deployStatus: ${e.status}]`;
        if (e.status === 'PROCESSING') {
            return `  app ${e.app}: 反映処理中（preview の変更を本番へ反映中） ${rawTag}`;
        }
        const failNote = e.status === 'FAIL' ? ' ※前回デプロイ失敗'
            : e.status === 'CANCEL' ? ' ※前回デプロイキャンセル'
                : '';
        if (e.divergence === 'no-diff') {
            return `  app ${e.app}: preview と本番に差分なし（本番反映済み）${failNote} ${rawTag}`;
        }
        if (e.divergence === 'has-diff') {
            return `  app ${e.app}: preview に未反映の変更あり（本番と差分あり）${failNote} ${rawTag}`;
        }
        if (e.divergence === 'fetch-failed') {
            return `  app ${e.app}: 差分確認に失敗${failNote} ${rawTag}`;
        }
        return `  app ${e.app}: ${e.status}`;
    }).join('\n');
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ---- スキーマ divergence チェック（launch / schema get-deploy-status で共用） ----
/**
 * オブジェクトキーをソートした安定 JSON 文字列を返す純粋関数。
 * live と preview のスキーマを一貫して比較するために使用する。
 * 配列の順序はそのまま保持（レイアウト順が意味を持つため）。
 */
export function normalizeForCompare(obj) {
    if (obj === null || typeof obj !== 'object')
        return JSON.stringify(obj);
    if (Array.isArray(obj))
        return '[' + obj.map(normalizeForCompare).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + normalizeForCompare(obj[k])).join(',') + '}';
}
/**
 * live と preview のスキーマ（フィールド / レイアウト / ビュー）を比較し、
 * 差分の有無を返す。取得エラーの場合は 'fetch-failed' を返す。
 * PROCESSING 状態のアプリには呼び出さない（呼び出し側で制御）。
 */
export async function checkSchemaDivergence(client, appId) {
    try {
        const [liveFields, previewFields, liveLayout, previewLayout, liveViews, previewViews] = await Promise.all([
            client.app.getFormFields({ app: appId }),
            client.app.getFormFields({ app: appId, preview: true }),
            client.app.getFormLayout({ app: appId }),
            client.app.getFormLayout({ app: appId, preview: true }),
            client.app.getViews({ app: appId }),
            client.app.getViews({ app: appId, preview: true }),
        ]);
        const fieldResult = diffSchemas(liveFields.properties, previewFields.properties);
        const hasFieldDiff = fieldResult.add.length > 0 || fieldResult.update.length > 0
            || fieldResult.delete.length > 0 || fieldResult.typeChange.length > 0;
        if (hasFieldDiff)
            return 'has-diff';
        if (normalizeForCompare(liveLayout.layout) !== normalizeForCompare(previewLayout.layout))
            return 'has-diff';
        const liveViewsSan = sanitizeViewsForUpdate(liveViews.views ?? {});
        const previewViewsSan = sanitizeViewsForUpdate(previewViews.views ?? {});
        if (normalizeForCompare(liveViewsSan) !== normalizeForCompare(previewViewsSan))
            return 'has-diff';
        return 'no-diff';
    }
    catch {
        return 'fetch-failed';
    }
}
/**
 * launch 前の schema 状態チェック結果を警告行に変換する純粋関数。
 * divergence が undefined は PROCESSING 中でチェックをスキップした状態。
 * env を渡すと schema deploy コマンド案内に実際の環境名を含める。
 * 警告不要の場合は null を返す。
 */
export function formatLaunchSchemaWarning(appName, deployStatus, divergence, env) {
    const lines = [];
    if (deployStatus === 'PROCESSING') {
        lines.push({ text: `⚠  ${appName}: スキーマ反映処理中です。完了後に launch を再実行することを推奨します。` });
    }
    else if (deployStatus === 'FAIL') {
        lines.push({ text: `⚠  ${appName}: 前回のスキーマデプロイが失敗しています [deployStatus: FAIL]。` });
    }
    else if (deployStatus === 'CANCEL') {
        lines.push({ text: `⚠  ${appName}: 前回のスキーマデプロイがキャンセルされました [deployStatus: CANCEL]。` });
    }
    if (divergence === 'has-diff') {
        lines.push({ text: `⚠  ${appName}: preview に未反映のスキーマ変更があります（フィールド / レイアウト / ビューの差分を検出）。` });
        const envFlag = env ? ` -e ${env}` : '';
        lines.push({ text: `   スキーマ変更を反映するには \`erakis schema deploy ${appName}${envFlag}\` を実行してください。` });
    }
    else if (divergence === 'fetch-failed') {
        lines.push({ text: `⚠  ${appName}: スキーマ差分の確認に失敗しました（ネットワークエラー等）。` });
    }
    if (lines.length > 0) {
        lines.push({ text: `   → 警告のみです。launch は継続します。` });
        return lines;
    }
    return null;
}
/**
 * リモートの preview revision を取得して返す。
 * ローカル revision と違う場合は true（要再 pull）を返す。
 */
export async function checkRemoteRevision(client, appId, localRevision) {
    const resp = await client.app.getFormFields({ app: appId, preview: true });
    const remoteRevision = String(resp.revision ?? '');
    const stale = remoteRevision !== '' && localRevision !== '' && remoteRevision !== localRevision;
    return { remoteRevision, stale };
}
