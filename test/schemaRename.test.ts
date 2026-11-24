import { describe, it } from 'mocha';
import { expect } from 'chai';
import { MAX_APP_NAME_LENGTH, validateAppName } from '../src/commands/schema/rename.js';

describe('validateAppName', () => {
    it('ふつうの名前は通る', () => {
        expect(validateAppName('案件管理')).to.equal(null);
    });

    it('空・空白だけはエラー', () => {
        expect(validateAppName('')).to.include('empty');
        expect(validateAppName('   ')).to.include('empty');
    });

    it('上限ちょうどは通り、1文字超えるとエラー', () => {
        expect(validateAppName('あ'.repeat(MAX_APP_NAME_LENGTH))).to.equal(null);
        expect(validateAppName('あ'.repeat(MAX_APP_NAME_LENGTH + 1))).to.include('too long');
    });

    it('サロゲートペアの文字は1文字として数える', () => {
        expect(validateAppName('𠮷'.repeat(MAX_APP_NAME_LENGTH))).to.equal(null);
    });
});
