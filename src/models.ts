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