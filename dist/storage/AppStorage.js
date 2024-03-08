import path from 'path';
import fs from 'fs-extra';
const homeDir = path.join('.erakis');
const appFile = path.join(homeDir, 'apps.json');
export class AppStorage {
    constructor() {
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }
        if (!fs.existsSync(appFile)) {
            const init = {
                customizations: {}
            };
            fs.writeJSONSync(appFile, init, {
                spaces: '\t'
            });
        }
    }
    saveCustomization(custom) {
        const json = this.getData();
        json.customizations[custom.appName] = custom;
        fs.writeJSONSync(appFile, json, { spaces: '\t' });
    }
    removeCustomization(name) {
        const json = this.getData();
        delete json.customizations[name];
        fs.writeJSONSync(appFile, json, { spaces: '\t' });
    }
    getData() {
        const json = fs.readJSONSync(appFile);
        return json;
    }
}
export const appFilePath = appFile;
