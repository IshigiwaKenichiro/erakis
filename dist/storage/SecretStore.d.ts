/**
 * パスワードの保存先。profiles.json に平文で残さないため、OS の資格情報ストアへ逃がす。
 * テストでは OS のストアを汚さないよう、メモリ実装に差し替える。
 */
export interface SecretStore {
    get(account: string): string | null;
    set(account: string, secret: string): void;
    delete(account: string): void;
}
/** Windows の資格情報マネージャー / macOS のキーチェーン / Linux の Secret Service */
export declare class KeyringSecretStore implements SecretStore {
    get(account: string): string | null;
    set(account: string, secret: string): void;
    delete(account: string): void;
}
export declare class MemorySecretStore implements SecretStore {
    readonly entries: Map<string, string>;
    get(account: string): string | null;
    set(account: string, secret: string): void;
    delete(account: string): void;
}
