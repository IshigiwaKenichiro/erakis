export type Server = {
    port: number;
    https?: {
        cert: string;
        key: string;
    };
};
export type Customization = {
    appName: string;
    development: App;
    production: App;
};
export type App = {
    profileName: string;
    appId: string;
    guestSpaceId: string;
    status: 'local' | 'fixed' | 'released';
    baseUrl: string;
};
/**
 * ローカルにプロファイルとして保存される接続情報
 */
export type Profile = {
    name: string;
    baseUrl: string;
    username: string;
    password: string;
    basicUsername: string;
    basicPassword: string;
};
export type AppData = {
    customizations: {
        [appName: string]: Customization;
    };
};
/**
 * low-level API自動生成のターゲット定義
 */
export type ApiTarget = {
    alias: string;
    appId: string;
    profile?: string;
    enabled: boolean;
};
/**
 * .erakis/api.json のスキーマ
 */
export type ApiConfig = {
    version: number;
    defaults: {
        profile?: string;
        outDir: string;
    };
    targets: ApiTarget[];
};
/**
 * CLI > target > defaults > 環境変数 の優先順位で解決済みのターゲット
 */
export type ResolvedTarget = {
    alias: string;
    appId: string;
    profile: string;
    outDir: string;
    enabled: boolean;
};
/** 検索対象とするデータの種類 */
export type SearchType = 'RECORD' | 'RECORD_COMMENT' | 'SPACE' | 'THREAD' | 'THREAD_COMMENT' | 'PEOPLE_COMMENT' | 'MESSAGE_COMMENT' | 'ATTACHMENT';
/** 検索条件の評価方法 */
export type SearchOperator = 'AND' | 'OR' | 'NOT';
/** 検索範囲の種類 */
export type SearchScopeKind = 'APP' | 'SPACE' | 'PEOPLE' | 'MESSAGE';
export type SearchCondition = {
    operator: SearchOperator;
    keywords: string[];
};
/**
 * 検索範囲。APP / SPACE は ids、PEOPLE / MESSAGE は codes で絞り込む。
 * どちらも省略すると、その種類のすべてが範囲になる。
 */
export type SearchScope = {
    scope: SearchScopeKind;
    ids?: string[];
    codes?: string[];
};
export type SearchSort = {
    by: 'RELEVANCE' | 'CREATED_AT';
    order: 'ASC' | 'DESC';
};
/** search.json へ送るリクエストボディ */
export type SearchRequest = {
    query: SearchCondition[];
    types?: SearchType[];
    scopes?: SearchScope[];
    excludeScopes?: SearchScope[];
    createdAfter?: string;
    createdBefore?: string;
    creators?: string[];
    includeSynonyms?: boolean;
    sort?: SearchSort;
    limit?: number;
    pageToken?: string;
};
/**
 * 検索をどのエンドポイントへ送るか。
 * all-guest は参加しているすべてのゲストスペース、guest は指定したゲストスペースだけを検索する。
 */
export type SearchEndpoint = {
    kind: 'default';
} | {
    kind: 'all-guest';
} | {
    kind: 'guest';
    guestSpaceId: string;
};
export type SearchUser = {
    code: string;
    name: string;
};
/**
 * 検索結果1件。種類ごとに形の違うレスポンスを、一覧で扱える共通の形にそろえたもの。
 * 種類ごとの詳細が要るときは raw を見る。
 */
export type SearchHit = {
    type: SearchType;
    url: string;
    snippets: string[];
    /** どこにあるデータか（アプリ名・スペース名・ピープルの所有者など） */
    location: string;
    /** 一覧で見出しにする名前（レコードタイトル・スレッド名・ファイル名など） */
    title: string;
    /** 閲覧権限が無いと null になる */
    createdAt: string | null;
    creator: SearchUser | null;
    raw: unknown;
};
export type SearchResult = {
    hits: SearchHit[];
    nextPageToken: string | null;
};
export type ApiError = {
    code: string;
    message: string;
    details?: unknown;
    raw?: unknown;
};
/** API 層が返す結果。例外は外へ漏らさず errors に入れて返す */
export type Result<T> = {
    success: true;
    data: T;
    errors: [];
} | {
    success: false;
    data?: undefined;
    errors: ApiError[];
};
