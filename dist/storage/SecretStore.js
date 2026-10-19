import { Entry } from '@napi-rs/keyring';
// 資格情報マネージャー / キーチェーン上で erakis の項目だと分かるようにする
const SERVICE = 'erakis';
/** Windows の資格情報マネージャー / macOS のキーチェーン / Linux の Secret Service */
export class KeyringSecretStore {
    get(account) {
        return new Entry(SERVICE, account).getPassword() ?? null;
    }
    set(account, secret) {
        new Entry(SERVICE, account).setPassword(secret);
    }
    delete(account) {
        new Entry(SERVICE, account).deletePassword();
    }
}
export class MemorySecretStore {
    entries = new Map();
    get(account) {
        return this.entries.get(account) ?? null;
    }
    set(account, secret) {
        this.entries.set(account, secret);
    }
    delete(account) {
        this.entries.delete(account);
    }
}
