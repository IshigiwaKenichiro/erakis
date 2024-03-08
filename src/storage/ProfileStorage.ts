import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import { Profile } from '../models.js';

type _SaveData = {
    profiles: {
        [name: string]: Profile
    }
}

const userHome = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"] ?? '';
const homeDir = path.join(userHome, '.erakis');
const profFile = path.join(homeDir, 'profiles.json');

export class ProfileStorage {
    constructor() {
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }

        if (!fs.existsSync(profFile)) {
            fs.writeJSONSync(profFile, {
                profiles: {}
            }, {
                spaces: '\t'
            })
        }
    }

    saveProfile(profile: Profile) {
        const json = this.getData();

        json.profiles[profile.name] = profile;

        fs.writeJSONSync(profFile, json, { spaces: '\t' });
    }

    removeProfile(name: string) {
        const json = this.getData();

        delete json.profiles[name];

        fs.writeJSONSync(profFile, json, { spaces: '\t' });

    }

    getData() {
        const json: _SaveData = fs.readJSONSync(profFile);

        return json;
    }
}

export const profFilePath = profFile