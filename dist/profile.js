import { ProfileStorage } from './storage/ProfileStorage.js';
/**
 * スクリプトから kintone の認証情報を使うための入口（`import { getProfile } from 'erakis/profile'`）。
 * どのクライアントで接続するかは使う側に任せ、erakis は認証情報を渡すところまでにとどめる。
 *
 * password / basicPassword は列挙されないプロパティなので、console.log(profile) や
 * JSON.stringify(profile) では出ない。値が要るときは profile.password と名指しする。
 */
export function getProfile(name) {
    const profile = new ProfileStorage().getData().profiles[name];
    // スクリプトは途中で止まってくれたほうが原因に気づきやすい
    if (profile == null) {
        throw new Error(`erakis: profile "${name}" not found. run "npx erakis profile list" to see the profiles.`);
    }
    return profile;
}
