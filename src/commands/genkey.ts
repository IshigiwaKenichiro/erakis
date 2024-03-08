import { exec } from '../utils/_exec.js';
import fs from 'fs-extra';
import { ServerStorage } from '../storage/ServerStorage.js'
import { program } from 'commander';

export function genkeyCommand() {
    program.command('genkey')
        .description('generates key-pair for https server. needs mkcert( https://community.chocolatey.org/packages/mkcert )')
        .action(genkey);
}

export function genkey(){
    const serverStorage = new ServerStorage();

    exec(`mkcert localhost`);

    console.log('key generation success.');

    fs.moveSync('./localhost.pem', './.erakis/localhost-cert.pem', { overwrite: true });
    fs.moveSync('./localhost-key.pem', './.erakis/localhost-key.pem', { overwrite: true });

    serverStorage.setKeys({
        key: "./.erakis/localhost-key.pem",
        cert: "./.erakis/localhost-cert.pem"
    });

    console.log("erakis saved cert/key files successfully. Goodluck =b")

}