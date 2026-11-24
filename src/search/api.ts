import type { ApiError, Profile, Result, SearchEndpoint, SearchRequest, SearchResult } from '../models.js';
import { toSearchResult } from './converters.js';
import { searchPath } from './request.js';

function ok<T>(data: T): Result<T> {
    return { success: true, data, errors: [] };
}

function fail<T>(errors: ApiError[]): Result<T> {
    return { success: false, errors };
}

/** --all で続きを取りにいくページ数の上限。誤って大量に取り続けないための歯止め */
export const MAX_SEARCH_PAGES = 50;

/**
 * search.json へ送るヘッダーを作る。
 * search.json は API トークンを受け付けないので、プロファイルのパスワード認証を使う。
 */
export function buildSearchHeaders(profile: Profile): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Cybozu-Authorization': Buffer.from(`${profile.username}:${profile.password}`).toString('base64'),
    };
    if (profile.basicUsername) {
        headers['Authorization'] = `Basic ${Buffer.from(`${profile.basicUsername}:${profile.basicPassword ?? ''}`).toString('base64')}`;
    }
    return headers;
}

/** kintone のエラーレスポンス（{ code, message, errors }）を ApiError にする */
async function toApiError(response: Response): Promise<ApiError> {
    const text = await response.text();
    try {
        const body = JSON.parse(text);
        return {
            code: String(body.code ?? `HTTP_${response.status}`),
            message: String(body.message ?? response.statusText),
            details: body.errors,
            raw: body,
        };
    } catch {
        return { code: `HTTP_${response.status}`, message: text || response.statusText };
    }
}

export const searchApi = {
    /** search.json を1回呼ぶ */
    async search(profile: Profile, endpoint: SearchEndpoint, request: SearchRequest): Promise<Result<SearchResult>> {
        try {
            const url = new URL(searchPath(endpoint), profile.baseUrl);
            const response = await fetch(url, {
                method: 'POST',
                headers: buildSearchHeaders(profile),
                body: JSON.stringify(request),
            });
            if (!response.ok) return fail([await toApiError(response)]);
            return ok(toSearchResult(await response.json()));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return fail([{ code: 'REQUEST_FAILED', message, raw: error }]);
        }
    },

    /**
     * nextPageToken をたどって、続きが無くなるまで検索する。
     * MAX_SEARCH_PAGES に達したら、そこまでの結果と続きのトークンを返す。
     */
    async searchAll(profile: Profile, endpoint: SearchEndpoint, request: SearchRequest): Promise<Result<SearchResult>> {
        const hits: SearchResult['hits'] = [];
        let pageToken = request.pageToken;

        for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
            const r = await searchApi.search(profile, endpoint, { ...request, pageToken });
            if (!r.success) return r;
            hits.push(...r.data.hits);
            if (r.data.nextPageToken === null) return ok({ hits, nextPageToken: null });
            pageToken = r.data.nextPageToken;
        }
        return ok({ hits, nextPageToken: pageToken ?? null });
    },
};
