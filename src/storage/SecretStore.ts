import { Entry } from '@napi-rs/keyring';

/**
 * パスワードの保存先。profiles.json に平文で残さないため、OS の資格情報ストアへ逃がす。
 * テストでは OS のストアを汚さないよう、メモリ実装に差し替える。
 */
export interface SecretStore {
    get(account: string): string | null;
    set(account: string, secret: string): void;
    delete(account: string): void;
}

// 資格情報マネージャー / キーチェーン上で erakis の項目だと分かるようにする
const SERVICE = 'erakis';

/** Windows の資格情報マネージャー / macOS のキーチェーン / Linux の Secret Service */
export class KeyringSecretStore implements SecretStore {
    get(account: string): string | null {
        return new Entry(SERVICE, account).getPassword() ?? null;
    }

    set(account: string, secret: string): void {
        new Entry(SERVICE, account).setPassword(secret);
    }

    delete(account: string): void {
        new Entry(SERVICE, account).deletePassword();
    }
}

export class MemorySecretStore implements SecretStore {
    readonly entries = new Map<string, string>();

    get(account: string): string | null {
        return this.entries.get(account) ?? null;
    }

    set(account: string, secret: string): void {
        this.entries.set(account, secret);
    }

    delete(account: string): void {
        this.entries.delete(account);
    }
}
