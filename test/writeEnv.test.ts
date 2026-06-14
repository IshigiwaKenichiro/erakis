import { describe, it } from 'mocha';
import { expect } from 'chai';
import { checkRevisionResult } from '../src/commands/schema/_helpers.js';

// ---- checkRevisionResult ----

describe('checkRevisionResult', () => {
    it('null → ok: false とエラーメッセージ', () => {
        const result = checkRevisionResult(null);
        expect(result.ok).to.be.false;
        if (!result.ok) {
            expect(result.error).to.be.a('string').and.not.empty;
        }
    });

    it('文字列の revision → ok: true と revision を返す', () => {
        const result = checkRevisionResult('5');
        expect(result.ok).to.be.true;
        if (result.ok) {
            expect(result.revision).to.equal('5');
        }
    });

    it('revision "1" → ok: true', () => {
        const result = checkRevisionResult('1');
        expect(result.ok).to.be.true;
    });

    it('null のとき error に "revision" 関連の文言が含まれる', () => {
        const result = checkRevisionResult(null);
        if (!result.ok) {
            expect(result.error).to.include('revision');
        }
    });
});
