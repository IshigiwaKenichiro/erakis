import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import { Profile } from '../models.js';
import { KeyringSecretStore, SecretStore } from './SecretStore.js';

/** profiles.json に書く形。パスワードは入れない */
type StoredProfile = Omit<Profile, 'password' | 'basicPassword'> & {
    // 1.2 系までは平文で入っていた。読み込み時に資格情報ストアへ移す
    password?: string;
    basicPassword?: string;
}

type _SaveData = {
    profiles: {
        [name: string]: StoredProfile
    }
}

type SecretKind = 'password' | 'basicPassword';

const SECRET_KINDS: readonly SecretKind[] = ['password', 'basicPassword'];

// 資格情報ストアが使えない環境（CI や Secret Service の無い Linux）向けの逃げ道
const SECRET_ENV: Record<SecretKind, string> = {
    password: 'ERAKIS_PASSWORD',
    basicPassword: 'ERAKIS_BASIC_PASSWORD',
};

// 自分のアカウント以外から読めないようにする（Windows では効かないが害もない）
const FILE_MODE = 0o600;

const userHome = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"] ?? '';
const homeDir = path.join(userHome, '.erakis');
const profFile = path.join(homeDir, 'profiles.json');

export type ProfileStorageOptions = {
    file?: string;
    secrets?: SecretStore;
}

export class ProfileStorage {
    private readonly file: string;
    private readonly secrets: SecretStore;
    private migrated = false;

    constructor(options: ProfileStorageOptions = {}) {
        this.file = options.file ?? profFile;
        this.secrets = options.secrets ?? new KeyringSecretStore();

        const dir = path.dirname(this.file);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(this.file)) {
            this.writeRaw({ profiles: {} });
        }
    }

    saveProfile(profile: Profile) {
        const json = this.readRaw();

        // 先にストアへ書く。失敗したらファイルは触らず、平文が残る状態を作らない
        for (const kind of SECRET_KINDS) {
            this.writeSecret(profile.name, kind, profile[kind]);
        }

        json.profiles[profile.name] = {
            name: profile.name,
            baseUrl: profile.baseUrl,
            username: profile.username,
            basicUsername: profile.basicUsername,
        };

        this.writeRaw(json);
    }

    removeProfile(name: string) {
        const json = this.readRaw();

        delete json.profiles[name];

        this.writeRaw(json);

        for (const kind of SECRET_KINDS) {
            try {
                this.secrets.delete(account(name, kind));
            } catch {
                // ストアに無い・使えないなら消すものも無い
            }
        }
    }

    getData(): { profiles: { [name: string]: Profile } } {
        // import 時に new されるモジュールがあるので、移行はコンストラクタではなく実際に使うときに行う
        if (!this.migrated) {
            this.migratePlainSecrets();
            this.migrated = true;
        }

        const json = this.readRaw();

        const profiles = _.mapValues(json.profiles, stored => this.withSecrets(stored));

        return { profiles };
    }

    /**
     * パスワードはアクセスされたときだけストアから読む。
     * 列挙されないプロパティにして、console.log や JSON.stringify でうっかり出ないようにする。
     */
    private withSecrets(stored: StoredProfile): Profile {
        const profile = {
            name: stored.name,
            baseUrl: stored.baseUrl,
            username: stored.username,
            basicUsername: stored.basicUsername,
        } as Profile;

        for (const kind of SECRET_KINDS) {
            let cache: string | undefined;
            Object.defineProperty(profile, kind, {
                enumerable: false,
                get: () => {
                    cache ??= this.readSecret(stored, kind);
                    return cache;
                },
            });
        }

        return profile;
    }

    private readSecret(stored: StoredProfile, kind: SecretKind): string {
        try {
            const secret = this.secrets.get(account(stored.name, kind));
            if (secret != null) return secret;
        } catch {
            // ストアが使えない環境では下の逃げ道へ
        }

        // 移行に失敗して平文が残っているときは、それで動かし続ける
        return stored[kind] ?? process.env[SECRET_ENV[kind]] ?? '';
    }

    private writeSecret(name: string, kind: SecretKind, secret: string | undefined) {
        try {
            if (_.isEmpty(secret)) {
                this.secrets.delete(account(name, kind));
                return;
            }
            this.secrets.set(account(name, kind), secret!);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(
                `could not store ${kind} of profile "${name}" in the OS credential store: ${reason}\n`
                + `If no credential store is available (CI etc.), set ${SECRET_ENV[kind]} instead of saving it.`
            );
        }
    }

    /** 1.2 系までに平文で保存されたパスワードを資格情報ストアへ移し、ファイルから消す */
    private migratePlainSecrets() {
        const json = this.readRaw();
        const migrated: string[] = [];

        for (const stored of Object.values(json.profiles)) {
            if (!SECRET_KINDS.some(kind => kind in stored)) continue;

            try {
                for (const kind of SECRET_KINDS) {
                    this.writeSecret(stored.name, kind, stored[kind]);
                }
            } catch (error) {
                // 移せないまま消すとパスワードを失うので、平文のまま残して知らせる
                const reason = error instanceof Error ? error.message : String(error);
                console.warn(`[erakis] profile "${stored.name}" still has a plaintext password in ${this.file}. ${reason}`);
                continue;
            }

            for (const kind of SECRET_KINDS) {
                delete stored[kind];
            }
            migrated.push(stored.name);
        }

        if (migrated.length === 0) return;

        this.writeRaw(json);
        console.warn(`[erakis] moved passwords of profile ${migrated.join(', ')} to the OS credential store.`);
    }

    private readRaw(): _SaveData {
        return fs.readJSONSync(this.file);
    }

    private writeRaw(json: _SaveData) {
        fs.writeJSONSync(this.file, json, { spaces: '\t', mode: FILE_MODE });
    }
}

function account(name: string, kind: SecretKind) {
    return `${name}/${kind}`;
}

export const profFilePath = profFile;
