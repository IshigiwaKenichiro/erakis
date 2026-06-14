import Table from 'cli-table';
import { appStorage, application2url, getChalk } from './_helpers.js';

/**
 * `erakis app status` — 接続済みアプリの一覧（dev/prod URL とステータス）をテーブルで出力する。
 * 読み取り専用 — kintone API を呼び出さない。
 */
export async function status() {
    const appData = appStorage.getData();

    const table = new Table({
        head: ['application_name', "development", "dev_state", "production", "prod_state"]
    });

    Object.values(appData.customizations).forEach(custom => {
        table.push([
            custom.appName,
            application2url(custom.development),
            getChalk(custom.development)(custom.development.status),
            application2url(custom.production),
            getChalk(custom.production)(custom.production.status)
        ]);
    });

    console.log(table.toString());
}
