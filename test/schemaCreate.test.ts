import { describe, it } from 'mocha';
import { expect } from 'chai';
import { parseSpaceRef, resolveProfileForCreate } from '../src/commands/schema/create.js';

describe('parseSpaceRef', () => {
    it('undefined → { id: undefined }', () => {
        expect(parseSpaceRef(undefined)).to.deep.equal({ id: undefined });
    });

    it('空文字 → { id: undefined }', () => {
        expect(parseSpaceRef('')).to.deep.equal({ id: undefined });
    });

    it('数値のみ → { id: "123" }', () => {
        expect(parseSpaceRef('123')).to.deep.equal({ id: '123' });
    });

    it('スラッシュ形式 → null（無効）', () => {
        expect(parseSpaceRef('123/456')).to.be.null;
    });

    it('文字列 → null（無効）', () => {
        expect(parseSpaceRef('abc')).to.be.null;
    });

    it('数値混じり文字列 → null（無効）', () => {
        expect(parseSpaceRef('1a2')).to.be.null;
    });
});

describe('resolveProfileForCreate', () => {
    it('明示的 --profile が存在する → そのプロファイル', () => {
        const r = resolveProfileForCreate(['alpha', 'beta'], 'alpha');
        expect(r).to.deep.equal({ profileName: 'alpha' });
    });

    it('明示的 --profile が存在しない → error', () => {
        const r = resolveProfileForCreate(['alpha', 'beta'], 'missing');
        expect(r).to.have.property('error');
        expect((r as any).error).to.include('missing');
    });

    it('hint なし + プロファイル1件 → そのプロファイル', () => {
        const r = resolveProfileForCreate(['only']);
        expect(r).to.deep.equal({ profileName: 'only' });
    });

    it('hint なし + 複数プロファイル → error', () => {
        const r = resolveProfileForCreate(['a', 'b']);
        expect(r).to.have.property('error');
        expect((r as any).error).to.include('--profile');
    });

    it('プロファイルなし → error', () => {
        const r = resolveProfileForCreate([]);
        expect(r).to.have.property('error');
    });
});
