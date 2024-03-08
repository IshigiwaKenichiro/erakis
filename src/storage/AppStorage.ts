
import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import type { AppData, Customization } from '../models.js';

const homeDir = path.join('.erakis');
const appFile = path.join(homeDir, 'apps.json');

export class AppStorage {
    constructor() {
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }

        if (!fs.existsSync(appFile)) {
            const init : AppData = {
                customizations: {}
            }
            fs.writeJSONSync(appFile, init, {
                spaces: '\t'
            })
        }
    }
    saveCustomization(custom : Customization) {
        const json = this.getData();

        json.customizations[custom.appName] = custom;

        fs.writeJSONSync(appFile, json, { spaces: '\t' });
    }

    removeCustomization(name : string) {
        const json = this.getData();

        delete json.customizations[name];

        fs.writeJSONSync(appFile, json, { spaces: '\t' });

    }

    getData() {
        const json : AppData = fs.readJSONSync(appFile);

        return json;
    }
}

export const appFilePath = appFile;
