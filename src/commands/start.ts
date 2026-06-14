#!/usr/bin/env node
import { exec } from '../utils/_exec.js';
import { getDevTargets, checkStartTargets } from '../utils/_getTargets.js';
import { ServerStorage } from '../storage/ServerStorage.js';
import { program } from 'commander';
const serverStorage = new ServerStorage();

export function startCommand() {
    program.command('start')
        .description('Start dev server. Enjoy!')
        .action(start);
}

export function start(){
    const server = serverStorage.getData();
    const { https, port: _port } = server;

    const port = _port ?? 51500;

    const targets = getDevTargets();

    const check = checkStartTargets(targets);
    if (!check.canStart) {
        console.log('起動対象がありません（カスタマイズアプリなし・index/test ページなし）。');
        return;
    }
    if (check.htmlOnly) {
        console.log('カスタマイズコードなし（src/app/<name>/ にエントリポイントが見つかりません）。登録のみ運用では正常です。index/test ページのみ起動します。');
    }

    if (null == https) {
        exec(`npx parcel ${targets.join(" ")} --open --port ${port} --no-cache --no-hmr`);
    } else {
        const { cert, key } = https;
        exec(`npx parcel ${targets.join(" ")} --open --port ${port} --no-cache --no-hmr --cert ${cert} --key ${key}`);
    }

}