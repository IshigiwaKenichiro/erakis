import path from 'path';
import { expect } from 'chai';
import os from 'os';
import { resolveFilePath } from '../src/commands/schema/_helpers.js';

/**
 * schema コマンドのファイルパス解決動作テスト
 *
 * schema get-field / get-layout / get-views (write) および
 * schema create-field / update-field / update-layout / update-views (read) は
 * すべて resolveFilePath(filePath) で正規化してから fs 操作に渡す。
 * このテストは resolveFilePath が正しく動作することを確認し、
 * コマンドが意図したヘルパーを経由していることを保証する。
 */
describe('resolveFilePath ヘルパー', () => {
    it('相対パスは process.cwd() 基準の絶対パスに変換される', () => {
        const resolved = resolveFilePath('field.json');
        expect(path.isAbsolute(resolved)).to.be.true;
        expect(resolved).to.equal(path.join(process.cwd(), 'field.json'));
    });

    it('ネストされた相対パスが正しく解決される', () => {
        const resolved = resolveFilePath(path.join('tmp', 'subdir', 'field.json'));
        expect(path.isAbsolute(resolved)).to.be.true;
        expect(resolved).to.equal(path.join(process.cwd(), 'tmp', 'subdir', 'field.json'));
    });

    it('すでに絶対パスの場合はそのまま返る', () => {
        const abs = path.join(os.tmpdir(), 'erakis-test', 'field.json');
        expect(resolveFilePath(abs)).to.equal(abs);
    });

    it('スペースを含む相対パスが正しく解決される', () => {
        const resolved = resolveFilePath(path.join('my folder', 'field.json'));
        expect(path.isAbsolute(resolved)).to.be.true;
        expect(resolved).to.include('my folder');
        expect(resolved).to.include('field.json');
    });

    it('スペースを含む絶対パスがそのまま通る', () => {
        const abs = path.join(os.tmpdir(), 'my project', 'field.json');
        expect(resolveFilePath(abs)).to.equal(abs);
    });

    it('./prefix 付き相対パスが正しく解決される', () => {
        const resolved = resolveFilePath('./tmp/field.json');
        expect(path.isAbsolute(resolved)).to.be.true;
        expect(resolved).to.equal(path.join(process.cwd(), 'tmp', 'field.json'));
    });
});

if (process.platform === 'win32') {
    describe('resolveFilePath ヘルパー — Windows 固有', () => {
        it('ドライブレター絶対パス (C:\\...) がそのまま返る', () => {
            const winPath = 'C:\\work\\erakis-test\\tmp\\field.json';
            expect(resolveFilePath(winPath)).to.equal(winPath);
        });

        it('スペースを含む Windows 絶対パスが解決される', () => {
            const winPath = 'C:\\work\\my project\\field.json';
            expect(resolveFilePath(winPath)).to.equal(winPath);
        });

        it('Windows 絶対パスは process.cwd() と結合されない', () => {
            const winPath = 'C:\\tmp\\schema-test\\field.json';
            const resolved = resolveFilePath(winPath);
            expect(resolved).to.equal(winPath);
            expect(resolved).not.to.include(process.cwd());
        });
    });
}
