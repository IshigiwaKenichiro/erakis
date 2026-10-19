import { Profile } from '../models.js';
import { SecretStore } from './SecretStore.js';
export type ProfileStorageOptions = {
    file?: string;
    secrets?: SecretStore;
};
export declare class ProfileStorage {
    private readonly file;
    private readonly secrets;
    private migrated;
    constructor(options?: ProfileStorageOptions);
    saveProfile(profile: Profile): void;
    removeProfile(name: string): void;
    getData(): {
        profiles: {
            [name: string]: Profile;
        };
    };
    /**
     * パスワードはアクセスされたときだけストアから読む。
     * 列挙されないプロパティにして、console.log や JSON.stringify でうっかり出ないようにする。
     */
    private withSecrets;
    private readSecret;
    private writeSecret;
    /** 1.2 系までに平文で保存されたパスワードを資格情報ストアへ移し、ファイルから消す */
    private migratePlainSecrets;
    private readRaw;
    private writeRaw;
}
export declare const profFilePath: string;
