import path from 'path';
import fs from 'fs-extra';
const homeDir = path.join('.erakis');
const serverFile = path.join(homeDir, 'server.json');
export class ServerStorage {
    constructor() {
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }
        if (!fs.existsSync(serverFile)) {
            const init = {
                port: 51500,
            };
            fs.writeJSONSync(serverFile, init, {
                spaces: '\t'
            });
        }
    }
    getData() {
        const server = fs.readJSONSync(serverFile);
        return server;
    }
    setData(server) {
        fs.writeJSONSync(serverFile, server, {
            spaces: '\t'
        });
    }
    setPort(port) {
        const server = this.getData();
        server.port = port;
        this.setData(server);
    }
    setKeys(https) {
        const server = this.getData();
        server.https = https;
        this.setData(server);
    }
}
