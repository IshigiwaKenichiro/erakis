import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ProfileStorage } from '../src/storage/ProfileStorage.js';
import { MemorySecretStore } from '../src/storage/SecretStore.js';
import { ensureGitignore } from '../src/utils/gitignore.js';

const PROFILE = {
    name: 'dev',
    baseUrl: 'https://example.cybozu.com',
    username: 'user',
    password: 'secret-pass',
    basicUsername: 'basic',
    basicPassword: 'basic-pass',
};

let dir: string;
let file: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erakis-profile-'));
    file = path.join(dir, 'profiles.json');
});

afterEach(() => {
    fs.removeSync(dir);
});

describe('ProfileStorage', () => {
    it('保存したパスワードはファイルに書かれず、ストアに入る', () => {
        const secrets = new MemorySecretStore();
        new ProfileStorage({ file, secrets }).saveProfile(PROFILE);

        const text = fs.readFileSync(file, 'utf8');
        expect(text).to.not.include('secret-pass');
        expect(text).to.not.include('basic-pass');
        expect(secrets.get('dev/password')).to.equal('secret-pass');
        expect(secrets.get('dev/basicPassword')).to.equal('basic-pass');
    });

    it('getData のパスワードはストアから読める', () => {
        const secrets = new MemorySecretStore();
        const storage = new ProfileStorage({ file, secrets });
        storage.saveProfile(PROFILE);

        const profile = storage.getData().profiles.dev;
        expect(profile.password).to.equal('secret-pass');
        expect(profile.basicPassword).to.equal('basic-pass');
        expect(profile.username).to.equal('user');
    });

    it('JSON.stringify や列挙ではパスワードが出ない', () => {
        const storage = new ProfileStorage({ file, secrets: new MemorySecretStore() });
        storage.saveProfile(PROFILE);

        const profile = storage.getData().profiles.dev;
        expect(JSON.stringify(profile)).to.not.include('secret-pass');
        expect(Object.keys(profile)).to.not.include('password');
    });

    it('平文で残っていたパスワードはストアへ移り、ファイルから消える', () => {
        fs.writeJSONSync(file, { profiles: { dev: PROFILE } });
        const secrets = new MemorySecretStore();

        const storage = new ProfileStorage({ file, secrets });
        expect(fs.readFileSync(file, 'utf8'), 'new しただけでは移さない').to.include('secret-pass');

        expect(storage.getData().profiles.dev.password).to.equal('secret-pass');
        expect(fs.readFileSync(file, 'utf8')).to.not.include('secret-pass');
        expect(secrets.get('dev/password')).to.equal('secret-pass');
    });

    it('ストアに書けないときは平文を消さずに残し、そのまま使える', () => {
        fs.writeJSONSync(file, { profiles: { dev: PROFILE } });
        const broken = new MemorySecretStore();
        broken.set = () => { throw new Error('no keyring'); };

        const storage = new ProfileStorage({ file, secrets: broken });

        expect(storage.getData().profiles.dev.password).to.equal('secret-pass');
        expect(fs.readFileSync(file, 'utf8')).to.include('secret-pass');
    });

    it('ストアに書けないときの保存はエラーになり、ファイルは変わらない', () => {
        const broken = new MemorySecretStore();
        broken.set = () => { throw new Error('no keyring'); };
        const storage = new ProfileStorage({ file, secrets: broken });

        expect(() => storage.saveProfile(PROFILE)).to.throw('ERAKIS_PASSWORD');
        expect(fs.readJSONSync(file).profiles).to.deep.equal({});
    });

    it('ストアが無くても ERAKIS_PASSWORD と同じ値ならパスワード抜きで保存し、読むときは環境変数を使う', () => {
        const broken = new MemorySecretStore();
        broken.set = () => { throw new Error('no keyring'); };
        broken.delete = () => { throw new Error('no keyring'); };
        broken.get = () => { throw new Error('no keyring'); };
        const storage = new ProfileStorage({ file, secrets: broken });

        process.env.ERAKIS_PASSWORD = 'secret-pass';
        try {
            storage.saveProfile({ ...PROFILE, basicUsername: '', basicPassword: '' });

            expect(fs.readFileSync(file, 'utf8')).to.not.include('secret-pass');
            expect(storage.getData().profiles.dev.password).to.equal('secret-pass');
        } finally {
            delete process.env.ERAKIS_PASSWORD;
        }
    });

    it('removeProfile はストアの項目も消す', () => {
        const secrets = new MemorySecretStore();
        const storage = new ProfileStorage({ file, secrets });
        storage.saveProfile(PROFILE);

        storage.removeProfile('dev');

        expect(secrets.entries.size).to.equal(0);
        expect(storage.getData().profiles.dev).to.be.undefined;
    });
});

describe('ensureGitignore', () => {
    it('無い行だけを追記する', () => {
        const gitignore = path.join(dir, '.gitignore');
        fs.writeFileSync(gitignore, 'node_modules\n.mcp.json');

        const added = ensureGitignore(gitignore);

        expect(added).to.deep.equal(['.ginuerc.js']);
        expect(fs.readFileSync(gitignore, 'utf8')).to.equal('node_modules\n.mcp.json\n.ginuerc.js\n');
    });

    it('すべて揃っていれば何もしない', () => {
        const gitignore = path.join(dir, '.gitignore');
        fs.writeFileSync(gitignore, '/.ginuerc.js\r\n.mcp.json\r\n');

        expect(ensureGitignore(gitignore)).to.deep.equal([]);
    });
});

