import _ from 'lodash';
import type {
    SearchCondition,
    SearchEndpoint,
    SearchRequest,
    SearchScope,
    SearchScopeKind,
    SearchSort,
    SearchType,
} from '../models.js';

/** search.json の上限値。超えると kintone がエラーを返すので、送る前に止める */
export const SEARCH_LIMITS = {
    MAX_CONDITIONS: 20,
    MAX_KEYWORDS_PER_CONDITION: 20,
    MAX_KEYWORDS_TOTAL: 20,
    MAX_KEYWORD_LENGTH: 50,
    MAX_SCOPES: 20,
    MAX_SCOPE_TARGETS: 20,
    MAX_CREATORS: 20,
    MIN_LIMIT: 1,
    MAX_LIMIT: 20,
} as const;

export const SEARCH_TYPES: readonly SearchType[] = [
    'RECORD',
    'RECORD_COMMENT',
    'SPACE',
    'THREAD',
    'THREAD_COMMENT',
    'PEOPLE_COMMENT',
    'MESSAGE_COMMENT',
    'ATTACHMENT',
];

/**
 * 範囲を指定するオプションの値。
 * commander は値を省いたオプションを true にするので、true は「その種類のすべて」を表す。
 */
export type ScopeOptionValue = string | true | undefined;

/** `erakis search` が受け取る CLI オプション（commander が渡す形のまま） */
export type SearchCliOptions = {
    and?: string[];
    or?: string[];
    not?: string[];
    type?: string;
    app?: ScopeOptionValue;
    space?: ScopeOptionValue;
    people?: ScopeOptionValue;
    message?: ScopeOptionValue;
    excludeApp?: ScopeOptionValue;
    excludeSpace?: ScopeOptionValue;
    excludePeople?: ScopeOptionValue;
    excludeMessage?: ScopeOptionValue;
    creator?: string;
    after?: string;
    before?: string;
    synonyms?: boolean;
    sort?: string;
    order?: string;
    limit?: string;
    pageToken?: string;
    guestSpace?: ScopeOptionValue;
};

export type BuildResult =
    | { ok: true; request: SearchRequest }
    | { ok: false; errors: string[] };

/** カンマ区切りの値を配列にする。空要素と前後の空白は捨てる */
export function splitList(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(s => s !== '');
}

/**
 * 位置引数と --and / --or / --not から検索条件を組み立てる。
 * 位置引数は1つの AND 条件にまとめる。オプションは1回の指定が1つの条件になる
 * （--or a,b --or c,d は「(a か b) かつ (c か d)」）。
 */
export function buildConditions(keywords: string[], options: Pick<SearchCliOptions, 'and' | 'or' | 'not'>): SearchCondition[] {
    const conditions: SearchCondition[] = [];
    const positional = keywords.map(k => k.trim()).filter(k => k !== '');
    if (positional.length > 0) conditions.push({ operator: 'AND', keywords: positional });

    const groups: [SearchCondition['operator'], string[] | undefined][] = [
        ['AND', options.and],
        ['OR', options.or],
        ['NOT', options.not],
    ];
    for (const [operator, values] of groups) {
        for (const value of values ?? []) {
            const list = splitList(value);
            if (list.length > 0) conditions.push({ operator, keywords: list });
        }
    }
    return conditions;
}

/** 検索条件が kintone の制約に収まっているかを調べ、違反をすべて返す */
export function validateConditions(conditions: SearchCondition[]): string[] {
    const errors: string[] = [];
    if (conditions.length === 0) {
        errors.push('no keywords. pass keywords as arguments or use --and / --or / --not.');
        return errors;
    }
    if (!conditions.some(c => c.operator !== 'NOT')) {
        // NOT だけの条件は kintone が空の結果を返すので、送る前に知らせる
        errors.push('at least one AND or OR condition is required. NOT alone always returns no results.');
    }
    if (conditions.length > SEARCH_LIMITS.MAX_CONDITIONS) {
        errors.push(`too many conditions (${conditions.length}). max is ${SEARCH_LIMITS.MAX_CONDITIONS}.`);
    }
    const total = _.sumBy(conditions, c => c.keywords.length);
    if (total > SEARCH_LIMITS.MAX_KEYWORDS_TOTAL) {
        errors.push(`too many keywords (${total}). max is ${SEARCH_LIMITS.MAX_KEYWORDS_TOTAL} in total.`);
    }
    for (const c of conditions) {
        if (c.keywords.length > SEARCH_LIMITS.MAX_KEYWORDS_PER_CONDITION) {
            errors.push(`too many keywords in one ${c.operator} condition. max is ${SEARCH_LIMITS.MAX_KEYWORDS_PER_CONDITION}.`);
        }
        for (const k of c.keywords) {
            if (k.length > SEARCH_LIMITS.MAX_KEYWORD_LENGTH) {
                errors.push(`keyword "${k}" is too long. max is ${SEARCH_LIMITS.MAX_KEYWORD_LENGTH} characters.`);
            }
        }
    }
    return errors;
}

/** --type の値（カンマ区切り・大文字小文字を問わない）を SearchType の配列にする */
export function parseTypes(value: string): { types: SearchType[]; errors: string[] } {
    const types: SearchType[] = [];
    const errors: string[] = [];
    for (const item of splitList(value)) {
        const upper = item.toUpperCase() as SearchType;
        if (!SEARCH_TYPES.includes(upper)) {
            errors.push(`unknown type "${item}". expected one of: ${SEARCH_TYPES.join(', ')}.`);
            continue;
        }
        if (!types.includes(upper)) types.push(upper);
    }
    return { types, errors };
}

/**
 * 範囲オプション1つを SearchScope にする。
 * APP / SPACE は数値IDを、PEOPLE / MESSAGE はログイン名を受け取る。
 */
export function parseScope(kind: SearchScopeKind, value: ScopeOptionValue, optionName: string): { scope?: SearchScope; errors: string[] } {
    if (value === undefined) return { errors: [] };
    if (value === true) return { scope: { scope: kind }, errors: [] };

    const list = splitList(value);
    const errors: string[] = [];
    if (list.length === 0) return { scope: { scope: kind }, errors };
    if (list.length > SEARCH_LIMITS.MAX_SCOPE_TARGETS) {
        errors.push(`${optionName}: too many targets (${list.length}). max is ${SEARCH_LIMITS.MAX_SCOPE_TARGETS}.`);
    }

    const usesIds = kind === 'APP' || kind === 'SPACE';
    if (!usesIds) return { scope: { scope: kind, codes: list }, errors };

    for (const id of list) {
        if (!/^\d+$/.test(id)) errors.push(`${optionName}: "${id}" is not a numeric ID.`);
    }
    return { scope: { scope: kind, ids: list }, errors };
}

/** 4種類の範囲オプションをまとめて SearchScope の配列にする */
function collectScopes(
    entries: [SearchScopeKind, ScopeOptionValue, string][],
    label: string,
): { scopes: SearchScope[]; errors: string[] } {
    const scopes: SearchScope[] = [];
    const errors: string[] = [];
    for (const [kind, value, optionName] of entries) {
        const r = parseScope(kind, value, optionName);
        errors.push(...r.errors);
        if (r.scope) scopes.push(r.scope);
    }
    if (scopes.length > SEARCH_LIMITS.MAX_SCOPES) {
        errors.push(`too many ${label} (${scopes.length}). max is ${SEARCH_LIMITS.MAX_SCOPES}.`);
    }
    return { scopes, errors };
}

/** --sort / --order を SearchSort にする。どちらも無ければ undefined（kintone の既定に任せる） */
export function parseSort(sort: string | undefined, order: string | undefined): { sort?: SearchSort; errors: string[] } {
    if (sort === undefined && order === undefined) return { errors: [] };
    const errors: string[] = [];

    const byMap: Record<string, SearchSort['by']> = {
        relevance: 'RELEVANCE',
        created: 'CREATED_AT',
        created_at: 'CREATED_AT',
    };
    const by = byMap[(sort ?? 'relevance').toLowerCase()];
    if (!by) errors.push(`unknown sort "${sort}". expected relevance or created.`);

    const orderUpper = (order ?? 'desc').toUpperCase();
    if (orderUpper !== 'ASC' && orderUpper !== 'DESC') {
        errors.push(`unknown order "${order}". expected asc or desc.`);
    }
    if (by === 'RELEVANCE' && orderUpper === 'ASC') {
        errors.push('--order asc cannot be used with relevance sort. use --sort created.');
    }
    if (errors.length > 0) return { errors };
    return { sort: { by, order: orderUpper as SearchSort['order'] }, errors };
}

/** --limit を 1〜20 の整数にする */
export function parseLimit(value: string | undefined): { limit?: number; errors: string[] } {
    if (value === undefined) return { errors: [] };
    const n = Number(value);
    if (!Number.isInteger(n) || n < SEARCH_LIMITS.MIN_LIMIT || n > SEARCH_LIMITS.MAX_LIMIT) {
        return { errors: [`--limit must be an integer from ${SEARCH_LIMITS.MIN_LIMIT} to ${SEARCH_LIMITS.MAX_LIMIT}.`] };
    }
    return { limit: n, errors: [] };
}

/** 作成日時の範囲を検証する。値は kintone にそのまま渡す */
export function validateDateRange(after: string | undefined, before: string | undefined): string[] {
    const errors: string[] = [];
    const afterTime = after === undefined ? undefined : Date.parse(after);
    const beforeTime = before === undefined ? undefined : Date.parse(before);
    if (afterTime !== undefined && Number.isNaN(afterTime)) errors.push(`--after "${after}" is not a valid date-time.`);
    if (beforeTime !== undefined && Number.isNaN(beforeTime)) errors.push(`--before "${before}" is not a valid date-time.`);
    if (errors.length > 0) return errors;
    if (afterTime !== undefined && beforeTime !== undefined && afterTime > beforeTime) {
        errors.push('--after must not be later than --before.');
    }
    return errors;
}

/** --guest-space を検索先のエンドポイントにする */
export function parseEndpoint(value: ScopeOptionValue): { endpoint?: SearchEndpoint; errors: string[] } {
    if (value === undefined) return { endpoint: { kind: 'default' }, errors: [] };
    if (value === true) return { endpoint: { kind: 'all-guest' }, errors: [] };
    if (!/^\d+$/.test(value)) return { errors: [`--guest-space: "${value}" is not a numeric ID.`] };
    return { endpoint: { kind: 'guest', guestSpaceId: value }, errors: [] };
}

/** エンドポイントごとの search.json のパス */
export function searchPath(endpoint: SearchEndpoint): string {
    switch (endpoint.kind) {
        case 'default': return '/k/v1/search.json';
        case 'all-guest': return '/k/guest/v1/search.json';
        case 'guest': return `/k/guest/${endpoint.guestSpaceId}/v1/search.json`;
    }
}

/**
 * CLI の引数とオプションから search.json のリクエストボディを組み立てる。
 * kintone の制約に反するものは送る前にすべて集めて返す。
 */
export function buildSearchRequest(keywords: string[], options: SearchCliOptions): BuildResult {
    const errors: string[] = [];

    const query = buildConditions(keywords, options);
    errors.push(...validateConditions(query));

    const request: SearchRequest = { query };

    if (options.type !== undefined) {
        const r = parseTypes(options.type);
        errors.push(...r.errors);
        if (r.types.length > 0) request.types = r.types;
    }

    const scopes = collectScopes([
        ['APP', options.app, '--app'],
        ['SPACE', options.space, '--space'],
        ['PEOPLE', options.people, '--people'],
        ['MESSAGE', options.message, '--message'],
    ], 'scopes');
    errors.push(...scopes.errors);
    if (scopes.scopes.length > 0) request.scopes = scopes.scopes;

    const excludes = collectScopes([
        ['APP', options.excludeApp, '--exclude-app'],
        ['SPACE', options.excludeSpace, '--exclude-space'],
        ['PEOPLE', options.excludePeople, '--exclude-people'],
        ['MESSAGE', options.excludeMessage, '--exclude-message'],
    ], 'exclude scopes');
    errors.push(...excludes.errors);
    if (excludes.scopes.length > 0) request.excludeScopes = excludes.scopes;

    if (options.creator !== undefined) {
        const creators = splitList(options.creator);
        if (creators.length > SEARCH_LIMITS.MAX_CREATORS) {
            errors.push(`too many creators (${creators.length}). max is ${SEARCH_LIMITS.MAX_CREATORS}.`);
        }
        if (creators.length > 0) request.creators = creators;
    }

    errors.push(...validateDateRange(options.after, options.before));
    if (options.after !== undefined) request.createdAfter = options.after;
    if (options.before !== undefined) request.createdBefore = options.before;

    if (options.synonyms) request.includeSynonyms = true;

    const sort = parseSort(options.sort, options.order);
    errors.push(...sort.errors);
    if (sort.sort) request.sort = sort.sort;

    const limit = parseLimit(options.limit);
    errors.push(...limit.errors);
    if (limit.limit !== undefined) request.limit = limit.limit;

    if (options.pageToken !== undefined && options.pageToken !== '') request.pageToken = options.pageToken;

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, request };
}
