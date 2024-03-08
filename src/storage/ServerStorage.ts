import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import { Server } from '../models.js';

const homeDir = path.join('.erakis');
const serverFile = path.join(homeDir, 'server.json');



export class ServerStorage {
    constructor() {
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }

        if (!fs.existsSync(serverFile)) {
            const init: Server = {
                port: 51500,
            }
            fs.writeJSONSync(serverFile, init, {
                spaces: '\t'
            })
        }
    }

    getData() {
        const server: Server = fs.readJSONSync(serverFile);

        return server;
    }

    setData(server: Server) {
        fs.writeJSONSync(serverFile, server, {
            spaces: '\t'
        })
    }

    setPort(port: number) {
        const server: Server = this.getData();

        server.port = port;

        this.setData(server);
    }

    setKeys(https: Server['https']) {

        const server = this.getData();

        server.https = https;

        this.setData(server);

    }
}