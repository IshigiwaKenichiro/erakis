import type { Profile } from './models.js';
export type { Profile } from './models.js';
/**
 * スクリプトから kintone の認証情報を使うための入口（`import { getProfile } from 'erakis/profile'`）。
 * どのクライアントで接続するかは使う側に任せ、erakis は認証情報を渡すところまでにとどめる。
 *
 * password / basicPassword は列挙されないプロパティなので、console.log(profile) や
 * JSON.stringify(profile) では出ない。値が要るときは profile.password と名指しする。
 */
export declare function getProfile(name: string): Profile;
