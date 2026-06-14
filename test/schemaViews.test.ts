import { describe, it } from 'mocha';
import { expect } from 'chai';
import { resolveViewsSyncEnvs, parseViewsInput } from '../src/commands/schema/views.js';

describe('resolveViewsSyncEnvs', () => {
    it('--to prod → from=dev, to=prod', () => {
        const r = resolveViewsSyncEnvs('prod');
        expect(r).to.deep.equal({ from: 'dev', to: 'prod' });
    });

    it('--to dev → from=prod, to=dev', () => {
        const r = resolveViewsSyncEnvs('dev');
        expect(r).to.deep.equal({ from: 'prod', to: 'dev' });
    });

    it('省略（undefined）→ error を返す', () => {
        const r = resolveViewsSyncEnvs(undefined);
        expect(r).to.have.property('error');
    });

    it('無効値 → error を返す', () => {
        const r = resolveViewsSyncEnvs('staging');
        expect(r).to.have.property('error');
    });
});

describe('parseViewsInput', () => {
    const sampleViews = {
        一覧: { id: '1', name: '一覧', type: 'LIST', filterCond: '' },
    };

    it('{ views: {...} } 形式 → views オブジェクトを返す', () => {
        const r = parseViewsInput({ views: sampleViews });
        expect(r).to.deep.equal(sampleViews);
    });

    it('素のオブジェクト → そのまま返す', () => {
        const r = parseViewsInput(sampleViews);
        expect(r).to.deep.equal(sampleViews);
    });

    it('get-views 出力をそのまま渡せる（ラウンドトリップ）', () => {
        const getViewsOutput = { views: sampleViews };
        const r = parseViewsInput(getViewsOutput);
        expect(r).to.deep.equal(sampleViews);
    });

    it('"views" という名前のビューを含むラッパー形式 → ラッパーとして扱う', () => {
        // raw.views がオブジェクトならラッパー優先という規則どおりの動作
        const viewNamedViews = { id: '99', name: 'views', type: 'LIST', filterCond: '' };
        const wrapper = { views: { views: viewNamedViews } };
        const r = parseViewsInput(wrapper);
        // ラッパーとして解釈されるので { views: viewNamedViews } が返る
        expect(r).to.deep.equal({ views: viewNamedViews });
    });

    it('空オブジェクト → そのまま返す', () => {
        const r = parseViewsInput({});
        expect(r).to.deep.equal({});
    });

    it('null → error を返す', () => {
        const r = parseViewsInput(null);
        expect(r).to.have.property('error');
    });

    it('配列 → error を返す', () => {
        const r = parseViewsInput([]);
        expect(r).to.have.property('error');
    });

    it('文字列 → error を返す', () => {
        const r = parseViewsInput('not a views object');
        expect(r).to.have.property('error');
    });

    it('{ views: "string" } → string はオブジェクトでないため素のマップとして扱う', () => {
        // views が string の場合は raw.views がオブジェクトでないのでラッパー条件を満たさず
        // 素のマップ { views: "string" } として返る
        const r = parseViewsInput({ views: 'not-object' });
        expect(r).to.deep.equal({ views: 'not-object' });
    });

    it('{ views: [...] } → 配列はオブジェクトでないため素のマップとして扱う', () => {
        const r = parseViewsInput({ views: [] });
        expect(r).to.deep.equal({ views: [] });
    });
});
