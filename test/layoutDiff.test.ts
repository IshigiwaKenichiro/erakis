import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
    flattenLayout,
    diffLayouts,
    formatLayoutDiffReport,
    formatFullLayoutDiff,
} from '../src/gen/layoutDiff.js';

// ---- テスト用ヘルパー ----

const field = (code: string, type = 'SINGLE_LINE_TEXT', extra: Record<string, unknown> = {}) =>
    ({ type, code, ...extra });

const spacer = (elementId: string) => ({ type: 'SPACER', elementId });
const label  = (elementId: string, text: string) => ({ type: 'LABEL', elementId, label: text });
const hr     = (elementId: string) => ({ type: 'HR', elementId });

const row = (...fields: any[]) => ({ type: 'ROW', fields });
const group = (code: string, ...rows: any[]) => ({ type: 'GROUP', code, label: code, noLabel: false, layout: rows });
const subtable = (code: string, ...fields: any[]) => ({ type: 'SUBTABLE', code, fields });

// ---- flattenLayout ----

describe('flattenLayout', () => {
    it('単純な ROW からフィールドを抽出する', () => {
        const layout = [row(field('件名'), field('金額', 'NUMBER'))];
        const elems = flattenLayout(layout);
        expect(elems).to.have.length(2);
        expect(elems[0].key).to.equal('field:件名');
        expect(elems[0].row).to.equal(0);
        expect(elems[0].col).to.equal(0);
        expect(elems[1].key).to.equal('field:金額');
        expect(elems[1].col).to.equal(1);
    });

    it('複数 ROW のインデックスが正しい', () => {
        const layout = [row(field('A')), row(field('B'))];
        const elems = flattenLayout(layout);
        expect(elems[0].row).to.equal(0);
        expect(elems[1].row).to.equal(1);
    });

    it('SPACER は spacer: キーを持つ', () => {
        const layout = [row(spacer('sp1'))];
        const elems = flattenLayout(layout);
        expect(elems[0].key).to.equal('spacer:sp1');
        expect(elems[0].kind).to.equal('spacer');
    });

    it('LABEL は label: キーを持つ', () => {
        const layout = [row(label('lbl1', '見出し'))];
        const elems = flattenLayout(layout);
        expect(elems[0].key).to.equal('label:lbl1');
        expect(elems[0].kind).to.equal('label');
    });

    it('HR は hr: キーを持つ', () => {
        const layout = [row(hr('hr1'))];
        const elems = flattenLayout(layout);
        expect(elems[0].key).to.equal('hr:hr1');
        expect(elems[0].kind).to.equal('hr');
    });

    it('GROUP 要素と GROUP 内フィールドを抽出する', () => {
        const layout = [group('grp1', row(field('grp_field')))];
        const elems = flattenLayout(layout);
        // GROUP 本体 + 内部フィールド
        expect(elems.length).to.be.at.least(2);
        const grpElem = elems.find(e => e.key === 'group:grp1');
        expect(grpElem).to.exist;
        const innerField = elems.find(e => e.key === 'field:grp_field');
        expect(innerField).to.exist;
        expect(innerField?.group).to.equal('grp1');
    });

    it('SUBTABLE は subtable: キーを持ち、子フィールドも parentTable 付きで展開される', () => {
        const layout = [subtable('table1', field('明細金額', 'NUMBER'))];
        const elems = flattenLayout(layout);
        expect(elems.length).to.equal(2);
        expect(elems[0].key).to.equal('subtable:table1');
        expect(elems[0].kind).to.equal('subtable');
        const child = elems.find(e => e.key === 'field:明細金額');
        expect(child).to.exist;
        expect(child?.parentTable).to.equal('table1');
    });

    it('空 layout は空配列を返す', () => {
        expect(flattenLayout([])).to.have.length(0);
    });

    it('elementId なし HR が複数あっても別キーになる', () => {
        const layout = [row({ type: 'HR' }), row({ type: 'HR' })];
        const elems = flattenLayout(layout);
        expect(elems).to.have.length(2);
        expect(elems[0].key).to.not.equal(elems[1].key);
    });

    it('同テキスト LABEL が複数あっても別キーになる', () => {
        const layout = [row({ type: 'LABEL', label: '見出し' }), row({ type: 'LABEL', label: '見出し' })];
        const elems = flattenLayout(layout);
        expect(elems).to.have.length(2);
        expect(elems[0].key).to.not.equal(elems[1].key);
    });

    it('同内容 SPACER が複数あっても別キーになる', () => {
        const layout = [
            row({ type: 'SPACER', size: { width: '100' } }),
            row({ type: 'SPACER', size: { width: '100' } }),
        ];
        const elems = flattenLayout(layout);
        expect(elems).to.have.length(2);
        expect(elems[0].key).to.not.equal(elems[1].key);
    });
});

// ---- diffLayouts ----

describe('diffLayouts', () => {
    it('同一 layout は差分なし', () => {
        const layout = [row(field('件名'), field('金額', 'NUMBER'))];
        const result = diffLayouts(layout, layout);
        expect(result.add).to.have.length(0);
        expect(result.delete).to.have.length(0);
        expect(result.move).to.have.length(0);
        expect(result.change).to.have.length(0);
    });

    it('prod に新規フィールドが追加された場合 add に入る', () => {
        const dev  = [row(field('件名'))];
        const prod = [row(field('件名')), row(field('新規', 'NUMBER'))];
        const result = diffLayouts(dev, prod);
        expect(result.add).to.have.length(1);
        expect(result.add[0].key).to.equal('field:新規');
    });

    it('dev にのみ存在するフィールドは delete に入る', () => {
        const dev  = [row(field('件名')), row(field('削除予定'))];
        const prod = [row(field('件名'))];
        const result = diffLayouts(dev, prod);
        expect(result.delete).to.have.length(1);
        expect(result.delete[0].key).to.equal('field:削除予定');
    });

    it('フィールドが別の行に移動した場合 move に入る', () => {
        const dev  = [row(field('件名')), row(field('金額', 'NUMBER'))];
        // prod では金額が row 0 に移動
        const prod = [row(field('金額', 'NUMBER')), row(field('件名'))];
        const result = diffLayouts(dev, prod);
        expect(result.move.length).to.be.at.least(1);
        const movedKeys = result.move.map(d => d.key);
        expect(movedKeys).to.include('field:件名');
    });

    it('SPACER の内容が変わった場合 change に入る', () => {
        const dev  = [row({ type: 'SPACER', elementId: 'sp1', size: { width: '100' } })];
        const prod = [row({ type: 'SPACER', elementId: 'sp1', size: { width: '200' } })];
        const result = diffLayouts(dev, prod);
        expect(result.change).to.have.length(1);
        expect(result.change[0].key).to.equal('spacer:sp1');
    });

    it('LABEL の内容が変わった場合 change に入る', () => {
        const dev  = [row(label('lbl1', '旧テキスト'))];
        const prod = [row(label('lbl1', '新テキスト'))];
        const result = diffLayouts(dev, prod);
        expect(result.change).to.have.length(1);
    });

    it('GROUP の label が変わった場合 change に入る', () => {
        const dev  = [{ type: 'GROUP', code: 'grp1', label: '旧グループ', noLabel: false, layout: [] }];
        const prod = [{ type: 'GROUP', code: 'grp1', label: '新グループ', noLabel: false, layout: [] }];
        const result = diffLayouts(dev, prod);
        expect(result.change).to.have.length(1);
        expect(result.change[0].key).to.equal('group:grp1');
    });

    it('GROUP 内のフィールドが追加された場合 add に入る', () => {
        const dev  = [group('grp1', row(field('A')))];
        const prod = [group('grp1', row(field('A')), row(field('B')))];
        const result = diffLayouts(dev, prod);
        expect(result.add.some(d => d.key === 'field:B')).to.be.true;
    });

    it('SUBTABLE 子フィールドが追加された場合 add に入る', () => {
        const dev  = [subtable('table1', field('A'))];
        const prod = [subtable('table1', field('A'), field('B'))];
        const result = diffLayouts(dev, prod);
        expect(result.add.some(d => d.key === 'field:B')).to.be.true;
    });

    it('SUBTABLE 子フィールドが削除された場合 delete に入る', () => {
        const dev  = [subtable('table1', field('A'), field('B'))];
        const prod = [subtable('table1', field('A'))];
        const result = diffLayouts(dev, prod);
        expect(result.delete.some(d => d.key === 'field:B')).to.be.true;
    });

    it('SUBTABLE 子フィールドの size が変わった場合 change に入る', () => {
        const dev  = [subtable('table1', { type: 'SINGLE_LINE_TEXT', code: 'A', size: { width: '100' } })];
        const prod = [subtable('table1', { type: 'SINGLE_LINE_TEXT', code: 'A', size: { width: '200' } })];
        const result = diffLayouts(dev, prod);
        expect(result.change.some(d => d.key === 'field:A')).to.be.true;
    });

    it('SUBTABLE 子フィールドが列移動した場合 move に入る', () => {
        const dev  = [subtable('table1', field('A'), field('B'))];
        const prod = [subtable('table1', field('B'), field('A'))];
        const result = diffLayouts(dev, prod);
        const movedKeys = result.move.map(d => d.key);
        expect(movedKeys).to.include('field:A');
    });

    it('move と change が同時に起きる場合は両方のリストに入る', () => {
        const dev  = [row(field('件名')), row({ type: 'SPACER', elementId: 'sp1', size: { width: '100' } })];
        const prod = [row({ type: 'SPACER', elementId: 'sp1', size: { width: '200' } }), row(field('件名'))];
        const result = diffLayouts(dev, prod);
        const spMoved = result.move.some(d => d.key === 'spacer:sp1');
        const spChanged = result.change.some(d => d.key === 'spacer:sp1');
        expect(spMoved).to.be.true;
        expect(spChanged).to.be.true;
    });
});

// ---- formatLayoutDiffReport ----

describe('formatLayoutDiffReport', () => {
    it('差分なしのとき「Layout 差分なし」を返す', () => {
        const result = { add: [], delete: [], move: [], change: [] };
        const text = formatLayoutDiffReport(result);
        expect(text).to.include('Layout 差分なし');
    });

    it('追加された要素の情報が含まれる', () => {
        const layout1 = [row(field('件名'))];
        const layout2 = [row(field('件名')), row(field('新規', 'NUMBER'))];
        const result = diffLayouts(layout1, layout2);
        const text = formatLayoutDiffReport(result);
        expect(text).to.include('+ field:新規');
        expect(text).to.include('prod:');
    });

    it('削除された要素の情報が含まれる', () => {
        const layout1 = [row(field('件名')), row(field('削除'))];
        const layout2 = [row(field('件名'))];
        const result = diffLayouts(layout1, layout2);
        const text = formatLayoutDiffReport(result);
        expect(text).to.include('- field:削除');
        expect(text).to.include('dev:');
    });

    it('移動した要素に dev:/prod: の位置情報が含まれる', () => {
        const layout1 = [row(field('A')), row(field('B'))];
        const layout2 = [row(field('B')), row(field('A'))];
        const result = diffLayouts(layout1, layout2);
        const text = formatLayoutDiffReport(result);
        expect(text).to.include('moved');
        expect(text).to.include('dev:');
        expect(text).to.include('prod:');
    });

    it('変更された要素に内容が含まれる', () => {
        const dev  = [row({ type: 'SPACER', elementId: 'sp1', size: { width: '100' } })];
        const prod = [row({ type: 'SPACER', elementId: 'sp1', size: { width: '200' } })];
        const result = diffLayouts(dev, prod);
        const text = formatLayoutDiffReport(result);
        expect(text).to.include('spacer:sp1');
        expect(text).to.include('changed');
    });

    it('件数サマリが含まれる', () => {
        const layout1 = [row(field('A')), row(field('B'))];
        const layout2 = [row(field('A')), row(field('C'))];
        const result = diffLayouts(layout1, layout2);
        const text = formatLayoutDiffReport(result);
        expect(text).to.include('追加');
        expect(text).to.include('削除');
    });
});

// ---- formatFullLayoutDiff ----

describe('formatFullLayoutDiff', () => {
    it('差分があるとき unified diff を返す', () => {
        const dev  = [row(field('件名')), row(field('金額', 'NUMBER'))];
        const prod = [row(field('金額', 'NUMBER')), row(field('件名'))];
        const text = formatFullLayoutDiff(dev, prod);
        expect(text.trim()).to.not.equal('');
        const hasChange = text.split('\n').some(l => l.startsWith('+') || l.startsWith('-'));
        expect(hasChange).to.be.true;
    });

    it('同一 layout は空文字を返す', () => {
        const layout = [row(field('件名'))];
        const text = formatFullLayoutDiff(layout, layout);
        expect(text.trim()).to.equal('');
    });
});
