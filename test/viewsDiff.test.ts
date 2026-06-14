import { describe, it } from 'mocha';
import { expect } from 'chai';
import { diffViews, formatViewsDiffReport, formatFullViewsDiff } from '../src/gen/viewsDiff.js';

const makeView = (type = 'LIST', extra: Record<string, any> = {}) =>
    ({ type, filterCond: '', sort: '', index: 0, ...extra });

// ---- diffViews ----

describe('diffViews', () => {
    it('同一 views は差分なし', () => {
        const views = { '一覧': makeView() };
        const result = diffViews(views, views);
        expect(result.add).to.have.length(0);
        expect(result.delete).to.have.length(0);
        expect(result.change).to.have.length(0);
    });

    it('prod のみ存在するビューは add に入る', () => {
        const dev = { '一覧': makeView() };
        const prod = { '一覧': makeView(), '新規': makeView('CALENDAR') };
        const result = diffViews(dev, prod);
        expect(result.add).to.deep.equal(['新規']);
        expect(result.delete).to.have.length(0);
    });

    it('dev のみ存在するビューは delete に入る', () => {
        const dev = { '一覧': makeView(), '旧ビュー': makeView() };
        const prod = { '一覧': makeView() };
        const result = diffViews(dev, prod);
        expect(result.delete).to.deep.equal(['旧ビュー']);
        expect(result.add).to.have.length(0);
    });

    it('filterCond が変わったビューは change に入る', () => {
        const dev = { '一覧': makeView('LIST', { filterCond: '' }) };
        const prod = { '一覧': makeView('LIST', { filterCond: 'status = "完了"' }) };
        const result = diffViews(dev, prod);
        expect(result.change).to.have.length(1);
        expect(result.change[0].name).to.equal('一覧');
        expect(result.change[0].changedProps).to.include('filterCond');
    });

    it('type が変わったビューは change に入る', () => {
        const dev = { '一覧': makeView('LIST') };
        const prod = { '一覧': makeView('CALENDAR') };
        const result = diffViews(dev, prod);
        expect(result.change.some(c => c.name === '一覧' && c.changedProps.includes('type'))).to.be.true;
    });

    it('id の差異は無視される', () => {
        const dev = { '一覧': { ...makeView(), id: '1' } };
        const prod = { '一覧': { ...makeView(), id: '99' } };
        const result = diffViews(dev, prod);
        expect(result.change).to.have.length(0);
    });

    it('add/delete/change のキーが view name でソートされる', () => {
        const dev = { 'Z': makeView(), 'A': makeView() };
        const prod = { 'B': makeView(), 'C': makeView() };
        const result = diffViews(dev, prod);
        expect(result.delete).to.deep.equal(['A', 'Z']);
        expect(result.add).to.deep.equal(['B', 'C']);
    });

    it('変更ビューの changedProps がアルファベット順にソートされる', () => {
        const dev = { '一覧': makeView('LIST', { filterCond: '', sort: '' }) };
        const prod = { '一覧': makeView('LIST', { filterCond: 'x = "y"', sort: 'field asc' }) };
        const result = diffViews(dev, prod);
        expect(result.change[0].changedProps).to.deep.equal(['filterCond', 'sort']);
    });
});

// ---- formatViewsDiffReport ----

describe('formatViewsDiffReport', () => {
    it('差分なしのとき「Views 差分なし」を返す', () => {
        const result = { add: [], delete: [], change: [] };
        expect(formatViewsDiffReport(result)).to.include('Views 差分なし');
    });

    it('追加ビューに + prefix が含まれる', () => {
        const result = { add: ['新規'], delete: [], change: [] };
        expect(formatViewsDiffReport(result)).to.include('+ 新規');
    });

    it('削除ビューに - prefix が含まれる', () => {
        const result = { add: [], delete: ['旧ビュー'], change: [] };
        expect(formatViewsDiffReport(result)).to.include('- 旧ビュー');
    });

    it('変更ビューに ~ prefix と変更プロパティが含まれる', () => {
        const result = { add: [], delete: [], change: [{ name: '一覧', changedProps: ['filterCond'] }] };
        const text = formatViewsDiffReport(result);
        expect(text).to.include('~ 一覧');
        expect(text).to.include('filterCond');
    });

    it('件数サマリが含まれる', () => {
        const result = { add: ['A'], delete: ['B'], change: [] };
        const text = formatViewsDiffReport(result);
        expect(text).to.include('追加 1件');
        expect(text).to.include('削除 1件');
        expect(text).to.include('変更 0件');
    });
});

// ---- formatFullViewsDiff ----

describe('formatFullViewsDiff', () => {
    it('差分があるとき unified diff を返す', () => {
        const dev = { '一覧': makeView('LIST', { filterCond: '' }) };
        const prod = { '一覧': makeView('LIST', { filterCond: 'x = "y"' }) };
        const text = formatFullViewsDiff(dev, prod);
        expect(text.trim()).to.not.equal('');
        const hasChange = text.split('\n').some(l => l.startsWith('+') || l.startsWith('-'));
        expect(hasChange).to.be.true;
    });

    it('同一 views は空文字を返す', () => {
        const views = { '一覧': makeView() };
        expect(formatFullViewsDiff(views, views).trim()).to.equal('');
    });

    it('id は normalized diff に含まれない', () => {
        const dev = { '一覧': { ...makeView(), id: '1' } };
        const prod = { '一覧': { ...makeView(), id: '99' } };
        expect(formatFullViewsDiff(dev, prod).trim()).to.equal('');
    });

    it('ビュー名でソートされた順で diff が生成される', () => {
        // A と Z 両方に変更を入れて両方が diff に確実に現れるようにする
        const dev = { 'Z': makeView('LIST', { filterCond: 'old' }), 'A': makeView('CALENDAR') };
        const prod = { 'Z': makeView('LIST', { filterCond: 'new' }), 'A': makeView() };
        const text = formatFullViewsDiff(dev, prod);
        expect(text.indexOf('"A"')).to.be.greaterThan(-1);
        expect(text.indexOf('"Z"')).to.be.greaterThan(-1);
        expect(text.indexOf('"A"')).to.be.lessThan(text.indexOf('"Z"'));
    });
});
