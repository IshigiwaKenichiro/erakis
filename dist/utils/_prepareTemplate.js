import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
//build file path
const __filename = fileURLToPath(import.meta.url);
//dist/utils
const __dirname = path.dirname(__filename);
export async function prepareTemplate(applicationName, overwrite = false) {
    const dir = path.join(".", 'src', 'app', applicationName);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
    await fs.copy(path.join(__dirname, '..', '..', 'templates', 'app'), dir, {
        overwrite
    });
}
export async function prepareTest(overwrite = false) {
    const dir = path.join(".", 'src', 'test');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
    await fs.copy(path.join(__dirname, '..', '..', 'templates', 'test'), dir, {
        overwrite
    });
}
export async function prepareIndex(overwrite = false) {
    const dir = path.join(".", '.erakis', 'index');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
    await fs.copy(path.join(__dirname, '..', '..', 'templates', 'index'), dir, {
        overwrite
    });
}
