import type { SearchHit, SearchResult, SearchType, SearchUser } from '../models.js';


/** search.json のレスポンス1件（型ごとに中身が違うので、受け口では緩く受ける） */
type RawHit = Record<string, any>;

function toUser(raw: any): SearchUser | null {
    if (raw == null || typeof raw !== 'object') return null;
    return { code: String(raw.code ?? ''), name: String(raw.name ?? '') };
}

/** 「スペース名 / アプリ名」のように、空でない場所の名前をつなぐ */
function joinLocation(...names: unknown[]): string {
    return names.filter(n => typeof n === 'string' && n !== '').join(' / ');
}

/**
 * 種類ごとの詳細オブジェクトから、場所・見出し・作成日時・作成者を取り出す。
 * 添付ファイルは添付先の情報（record / thread など）も一緒に返るので、場所は添付先から取る。
 */
function describe(hit: RawHit): Pick<SearchHit, 'location' | 'title' | 'createdAt' | 'creator'> {
    const parent = describeParent(hit);
    if (hit.type !== 'ATTACHMENT') return parent;

    const a = hit.attachment ?? {};
    return {
        location: parent.location,
        title: String(a.name ?? ''),
        createdAt: a.createdAt ?? null,
        creator: toUser(a.creator),
    };
}

function describeParent(hit: RawHit): Pick<SearchHit, 'location' | 'title' | 'createdAt' | 'creator'> {
    if (hit.record) {
        const r = hit.record;
        return {
            location: joinLocation(r.spaceName, r.appName),
            title: `#${r.recordId} ${r.recordTitle ?? ''}`.trim(),
            createdAt: r.createdAt ?? null,
            creator: toUser(r.creator),
        };
    }
    if (hit.recordComment) {
        const c = hit.recordComment;
        return {
            location: joinLocation(c.spaceName, c.appName),
            title: `#${c.recordId} ${c.recordTitle ?? ''}`.trim(),
            createdAt: c.createdAt ?? null,
            creator: toUser(c.creator),
        };
    }
    if (hit.threadComment) {
        const c = hit.threadComment;
        return {
            location: joinLocation(c.spaceName, c.threadName),
            title: c.replyId ? `comment ${c.commentId} reply ${c.replyId}` : `comment ${c.commentId}`,
            createdAt: c.createdAt ?? null,
            creator: toUser(c.creator),
        };
    }
    if (hit.thread) {
        const t = hit.thread;
        return {
            location: joinLocation(t.spaceName),
            title: String(t.threadName ?? ''),
            createdAt: t.createdAt ?? null,
            creator: toUser(t.creator),
        };
    }
    if (hit.space) {
        const s = hit.space;
        return {
            location: '',
            title: String(s.spaceName ?? ''),
            createdAt: s.createdAt ?? null,
            creator: toUser(s.creator),
        };
    }
    if (hit.peopleComment) {
        const c = hit.peopleComment;
        return {
            location: `people: ${c.owner?.name ?? c.owner?.code ?? ''}`,
            title: c.replyId ? `comment ${c.commentId} reply ${c.replyId}` : `comment ${c.commentId}`,
            createdAt: c.createdAt ?? null,
            creator: toUser(c.creator),
        };
    }
    if (hit.messageComment) {
        const c = hit.messageComment;
        return {
            location: `message: ${c.recipient?.name ?? c.recipient?.code ?? ''}`,
            title: `comment ${c.commentId}`,
            createdAt: c.createdAt ?? null,
            creator: toUser(c.creator),
        };
    }
    return { location: '', title: '', createdAt: null, creator: null };
}

/** search.json の hits[] の1件を SearchHit にする */
export function toSearchHit(hit: RawHit): SearchHit {
    // kintone が種類を増やしても検索全体を止めないよう、知らない種類もそのまま通す。
    // 場所や見出しは取れないので空になるが、url と snippets は読める
    return {
        type: String(hit.type) as SearchType,
        url: String(hit.url ?? ''),
        snippets: Array.isArray(hit.snippets) ? hit.snippets.map(String) : [],
        ...describe(hit),
        raw: hit,
    };
}

/**
 * search.json のレスポンスを SearchResult にする。
 * 想定と違う形なら例外を投げる（API 層で受けてエラーとして返す）。
 */
export function toSearchResult(body: unknown): SearchResult {
    if (body == null || typeof body !== 'object' || !Array.isArray((body as any).hits)) {
        throw new Error('unexpected response: "hits" is missing.');
    }
    const raw = body as { hits: RawHit[]; nextPageToken?: string | null };
    return {
        hits: raw.hits.map(toSearchHit),
        nextPageToken: raw.nextPageToken ?? null,
    };
}
