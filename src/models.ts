export type Server = {
    port : number;
    https?: {
        cert : string;
        key : string;
    }
}

export type Customization = {
    appName : string;
    development : App
    production : App
}

export type App = {
    profileName : string;
    appId : string;
    guestSpaceId : string;
    status : 'local' | 'fixed' | 'released';
    baseUrl : string;
}

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
}

export type AppData = {
    customizations : {
        [appName : string] : Customization;
    }
}

/**
 * low-level API自動生成のターゲット定義
 */
export type ApiTarget = {
    alias: string;
    appId: string;
    profile?: string;
    enabled: boolean;
}

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
}

/**
 * CLI > target > defaults > 環境変数 の優先順位で解決済みのターゲット
 */
export type ResolvedTarget = {
    alias: string;
    appId: string;
    profile: string;
    outDir: string;
    enabled: boolean;
}