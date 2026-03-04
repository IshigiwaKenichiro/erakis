import path from 'path';
import fs from 'fs-extra';
import type { ApiConfig, ApiTarget, ResolvedTarget } from '../models.js';

const homeDir = path.join('.erakis');
const apiFile = path.join(homeDir, 'api.json');

const INITIAL_DATA: ApiConfig = {
    version: 1,
    defaults: {
        outDir: 'src/gen/kintone'
    },
    targets: []
};

export class ApiStorage {
    constructor() {
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }
    }

    /** api.jsonが存在するか */
    exists(): boolean {
        return fs.existsSync(apiFile);
    }

    getData(): ApiConfig {
        if (!this.exists()) {
            return { ...INITIAL_DATA, defaults: { ...INITIAL_DATA.defaults }, targets: [] };
        }
        const json: ApiConfig = fs.readJSONSync(apiFile);
        return json;
    }

    /** aliasキーでupsert */
    saveTarget(target: ApiTarget) {
        const json = this.exists() ? this.getData() : { ...INITIAL_DATA, defaults: { ...INITIAL_DATA.defaults }, targets: [] };

        const idx = json.targets.findIndex(t => t.alias === target.alias);
        if (idx >= 0) {
            json.targets[idx] = target;
        } else {
            json.targets.push(target);
        }

        fs.writeJSONSync(apiFile, json, { spaces: '\t' });
    }

    /** alias指定で削除 */
    removeTarget(alias: string): boolean {
        if (!this.exists()) return false;

        const json = this.getData();
        const idx = json.targets.findIndex(t => t.alias === alias);
        if (idx < 0) return false;

        json.targets.splice(idx, 1);
        fs.writeJSONSync(apiFile, json, { spaces: '\t' });
        return true;
    }

    /** defaults.profileを設定 */
    setDefaultProfile(profile: string) {
        const json = this.exists() ? this.getData() : { ...INITIAL_DATA, defaults: { ...INITIAL_DATA.defaults }, targets: [] };
        json.defaults.profile = profile;
        fs.writeJSONSync(apiFile, json, { spaces: '\t' });
    }

    /**
     * CLI > target > defaults > 環境変数 の優先順位で解決済みターゲット列を返す
     * @param cliOptions CLIオプション
     * @param filterAliases 指定時、このalias群のみに絞り込む
     */
    getResolvedTargets(cliOptions: { profile?: string; out?: string }, filterAliases?: string[]): ResolvedTarget[] {
        const config = this.getData();

        let targets = config.targets.filter(t => t.enabled);

        if (filterAliases && filterAliases.length > 0) {
            targets = targets.filter(t => filterAliases.includes(t.alias));
        }

        const outDir = cliOptions.out ?? config.defaults.outDir;

        return targets.map(t => ({
            alias: t.alias,
            appId: t.appId,
            profile: cliOptions.profile ?? t.profile ?? config.defaults.profile ?? process.env.ERAKIS_PROFILE ?? '',
            outDir,
            enabled: t.enabled,
        }));
    }

    /** defaults.outDirを設定 */
    setDefaultOutDir(outDir: string) {
        const json = this.exists() ? this.getData() : { ...INITIAL_DATA, defaults: { ...INITIAL_DATA.defaults }, targets: [] };
        json.defaults.outDir = outDir;
        fs.writeJSONSync(apiFile, json, { spaces: '\t' });
    }
}

export const apiFilePath = apiFile;
