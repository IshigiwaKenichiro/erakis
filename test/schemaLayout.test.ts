import { describe, it } from 'mocha';
import { expect } from 'chai';
import { resolveLayoutSyncEnvs, parseLayoutInput } from '../src/commands/schema/layout.js';

describe('resolveLayoutSyncEnvs', () => {
    it('--to prod → from=dev, to=prod', () => {
        const r = resolveLayoutSyncEnvs('prod');
        expect(r).to.deep.equal({ from: 'dev', to: 'prod' });
    });

    it('--to dev → from=prod, to=dev', () => {
        const r = resolveLayoutSyncEnvs('dev');
        expect(r).to.deep.equal({ from: 'prod', to: 'dev' });
    });

    it('省略（undefined）→ error を返す', () => {
        const r = resolveLayoutSyncEnvs(undefined);
        expect(r).to.have.property('error');
    });

    it('無効値 → error を返す', () => {
        const r = resolveLayoutSyncEnvs('staging');
        expect(r).to.have.property('error');
    });
});

describe('parseLayoutInput', () => {
    const sampleLayout = [{ type: 'ROW', fields: [] }];

    it('素の配列 → そのまま返す', () => {
        const r = parseLayoutInput(sampleLayout);
        expect(r).to.deep.equal(sampleLayout);
    });

    it('{ layout: [...] } 形式 → layout 配列を返す', () => {
        const r = parseLayoutInput({ layout: sampleLayout });
        expect(r).to.deep.equal(sampleLayout);
    });

    it('get-layout 出力をそのまま渡せる（ラウンドトリップ）', () => {
        // get-layout が出力する { layout: [...] } を update-layout に渡すと成立する
        const getLayoutOutput = { layout: sampleLayout };
        const r = parseLayoutInput(getLayoutOutput);
        expect(Array.isArray(r)).to.be.true;
        expect(r).to.deep.equal(sampleLayout);
    });

    it('{ layout: [...] } の空配列も受け付ける', () => {
        const r = parseLayoutInput({ layout: [] });
        expect(r).to.deep.equal([]);
    });

    it('null → error を返す', () => {
        const r = parseLayoutInput(null);
        expect(r).to.have.property('error');
    });

    it('文字列 → error を返す', () => {
        const r = parseLayoutInput('not a layout');
        expect(r).to.have.property('error');
    });

    it('{ layout: "string" } → error を返す（layout が配列でない）', () => {
        const r = parseLayoutInput({ layout: 'not-array' });
        expect(r).to.have.property('error');
    });

    it('{ fields: [...] } など layout キーなし → error を返す', () => {
        const r = parseLayoutInput({ fields: [] });
        expect(r).to.have.property('error');
    });
});
