import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
//build file path
const __filename = fileURLToPath(import.meta.url);

//dist/utils
const __dirname = path.dirname(__filename);

export function prepareTemplate(applicationName : string, overwrite = false) {
    const dir = path.join(".", 'src', 'app', applicationName);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }

    fs.copy(path.join(__dirname, '..','..','templates','app'), dir, {
        overwrite
    });
}

export function prepareTest( overwrite = false){
    const dir = path.join(".", 'src', 'test');

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }

    fs.copy(path.join(__dirname, '..','..','templates','test'), dir, {
        overwrite
    });
}
export function prepareIndex( overwrite = false){
    const dir = path.join(".", '.erakis','index');

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }

    fs.copy(path.join(__dirname, '..','..','templates','index'), dir, {
        overwrite
    });
}


