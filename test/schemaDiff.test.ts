import { describe, it } from 'mocha';
import { expect } from 'chai';
import { diffSchemas, formatDiffSummary, formatFullDiff } from '../src/gen/schemaDiff.js';

const makeField = (type: string, label: string, extra: Record<string, unknown> = {}) =>
    ({ type, label, ...extra });

describe('diffSchemas', () => {
    it('同一スキーマは差分なし', () => {
        const fields = { 件名: makeField('SINGLE_LINE_TEXT', '件名') };
        const result = diffSchemas(fields, fields);
        expect(result.add).to.have.length(0);
        expect(result.update).to.have.length(0);
        expect(result.delete).to.have.length(0);
        expect(result.typeChange).to.have.length(0);
    });

    it('to にあって from にないフィールドを add と判定する', () => {
        const from = { 件名: makeField('SINGLE_LINE_TEXT', '件名') };
        const to = {
            件名: makeField('SINGLE_LINE_TEXT', '件名'),
            金額: makeField('NUMBER', '金額'),
        };
        const result = diffSchemas(from, to);
        expect(result.add).to.have.length(1);
        expect(result.add[0].code).to.equal('金額');
        expect(result.add[0].toType).to.equal('NUMBER');
    });

    it('from にあって to にないフィールドを delete と判定する', () => {
        const from = {
            件名: makeField('SINGLE_LINE_TEXT', '件名'),
            旧フィールド: makeField('MULTI_LINE_TEXT', '旧フィールド'),
        };
        const to = { 件名: makeField('SINGLE_LINE_TEXT', '件名') };
        const result = diffSchemas(from, to);
        expect(result.delete).to.have.length(1);
        expect(result.delete[0].code).to.equal('旧フィールド');
        expect(result.delete[0].fromType).to.equal('MULTI_LINE_TEXT');
    });

    it('型が変わったフィールドを typeChange と判定する', () => {
        const from = { 件名: makeField('SINGLE_LINE_TEXT', '件名') };
        const to = { 件名: makeField('MULTI_LINE_TEXT', '件名') };
        const result = diffSchemas(from, to);
        expect(result.typeChange).to.have.length(1);
        expect(result.typeChange[0].fromType).to.equal('SINGLE_LINE_TEXT');
        expect(result.typeChange[0].toType).to.equal('MULTI_LINE_TEXT');
        expect(result.update).to.have.length(0);
    });

    it('プロパティが変わったフィールドを update と判定する', () => {
        const from = { 件名: makeField('SINGLE_LINE_TEXT', '件名', { required: false }) };
        const to   = { 件名: makeField('SINGLE_LINE_TEXT', '件名', { required: true  }) };
        const result = diffSchemas(from, to);
        expect(result.update).to.have.length(1);
        expect(result.update[0].changedProps).to.include('required');
    });

    it('システムフィールド(RECORD_NUMBER等)はスキップされる', () => {
        const from = { レコード番号: makeField('RECORD_NUMBER', 'レコード番号') };
        const to: Record<string, any> = {};  // to に存在しなくてもスキップ
        const result = diffSchemas(from, to);
        expect(result.add.length + result.update.length + result.delete.length + result.typeChange.length).to.equal(0);
    });

    it('複数の差分カテゴリが同時に検出できる', () => {
        const from = {
            フィールドA: makeField('SINGLE_LINE_TEXT', 'A'),
            フィールドB: makeField('NUMBER', 'B'),
            フィールドC: makeField('DATE', 'C', { required: false }),
        };
        const to = {
            フィールドA: makeField('SINGLE_LINE_TEXT', 'A'),  // 変更なし
            フィールドB: makeField('MULTI_LINE_TEXT', 'B'),    // 型変更
            フィールドC: makeField('DATE', 'C', { required: true }), // プロパティ変更
            フィールドD: makeField('CHECKBOX', 'D'),            // 追加
        };
        const result = diffSchemas(from, to);
        expect(result.add).to.have.length(1);
        expect(result.update).to.have.length(1);
        expect(result.delete).to.have.length(0);
        expect(result.typeChange).to.have.length(1);
    });

    it('changedProps から code はスキップされる', () => {
        const from = { 件名: { type: 'SINGLE_LINE_TEXT', label: '件名', code: '件名' } };
        const to   = { 件名: { type: 'SINGLE_LINE_TEXT', label: '件名', code: '件名_renamed' } };
        const result = diffSchemas(from, to);
        // code の変化のみなので update に入らない
        expect(result.update).to.have.length(0);
    });

    it('noLabel の変化は changedProps に含まれる（UI 表示に意味があるため差分対象）', () => {
        const from = { 件名: { type: 'SINGLE_LINE_TEXT', label: '件名', code: '件名', noLabel: false } };
        const to   = { 件名: { type: 'SINGLE_LINE_TEXT', label: '件名', code: '件名', noLabel: true } };
        const result = diffSchemas(from, to);
        expect(result.update).to.have.length(1);
        expect(result.update[0].changedProps).to.include('noLabel');
    });
});

describe('formatDiffSummary', () => {
    it('差分なしのとき「差分なし」を返す', () => {
        const result = { add: [], update: [], delete: [], typeChange: [] };
        const text = formatDiffSummary(result, 'dev', 'prod');
        expect(text).to.include('差分なし');
    });

    it('add/update/delete/typeChange の件数サマリが含まれる', () => {
        const fields = { 件名: makeField('SINGLE_LINE_TEXT', '件名') };
        const result = diffSchemas(
            { 件名: makeField('SINGLE_LINE_TEXT', '件名') },
            {
                件名: makeField('SINGLE_LINE_TEXT', '件名', { required: true }),
                新フィールド: makeField('NUMBER', '新'),
            },
        );
        const text = formatDiffSummary(result, 'dev', 'prod');
        expect(text).to.include('追加: 1件');
        expect(text).to.include('変更: 1件');
    });

    it('typeChange にデータ消失の警告が含まれる', () => {
        const result = {
            add: [],
            update: [],
            delete: [],
            typeChange: [{ category: 'type-change' as const, code: 'フィールドB', fromType: 'SINGLE_LINE_TEXT', toType: 'NUMBER' }],
        };
        const text = formatDiffSummary(result, 'dev', 'prod');
        expect(text).to.include('データが消える');
    });

    it('次のステップに追加が必要なフィールドが列挙され、Phase E / 未実装などのロードマップ文言は出力されない', () => {
        const result = {
            add: [{ category: 'add' as const, code: '新フィールド', toType: 'SINGLE_LINE_TEXT' }],
            update: [], delete: [], typeChange: [],
        };
        const text = formatDiffSummary(result, 'dev', 'prod', 'myapp');
        expect(text).not.to.include('Phase E');
        expect(text).not.to.include('未実装');
        expect(text).not.to.include('npx erakis');
        expect(text).to.include('追加が必要: 新フィールド');
    });

    it('from → to のラベルが出力に含まれる', () => {
        const result = { add: [], update: [], delete: [], typeChange: [] };
        const text = formatDiffSummary(result, 'local(dev)', 'prod(live)');
        expect(text).to.include('local(dev)');
        expect(text).to.include('prod(live)');
    });

    it('update 差分に fromFields/toFields を渡すと property の dev/prod 値が表示される', () => {
        const fromFields = { 金額: { type: 'NUMBER', label: '金額', code: '金額', required: false, maxValue: '' } };
        const toFields   = { 金額: { type: 'NUMBER', label: '金額', code: '金額', required: true,  maxValue: '99' } };
        const result = diffSchemas(fromFields, toFields);
        const text = formatDiffSummary(result, 'dev', 'prod', '', fromFields, toFields);
        expect(text).to.include('required:');
        expect(text).to.include('dev: false');
        expect(text).to.include('prod: true');
        expect(text).to.include('maxValue:');
        expect(text).to.include('dev: ""');
        expect(text).to.include('prod: "99"');
    });

    it('大きい property は変更あり サマリと --full ヒントを表示する', () => {
        const largeOptions: Record<string, unknown> = {};
        for (let i = 0; i < 20; i++) largeOptions[`option${i}`] = { label: `option ${i}`, value: `val${i}` };
        const smallOptions: Record<string, unknown> = {};
        for (let i = 0; i < 3; i++) smallOptions[`opt${i}`] = { label: `opt ${i}`, value: `v${i}` };
        const fromFields = { 分類: { type: 'DROP_DOWN', label: '分類', options: largeOptions } };
        const toFields   = { 分類: { type: 'DROP_DOWN', label: '分類', options: smallOptions } };
        const result = diffSchemas(fromFields, toFields);
        const text = formatDiffSummary(result, 'dev', 'prod', '', fromFields, toFields);
        expect(text).to.include('変更あり');
        expect(text).to.include('--full');
    });
});

describe('formatFullDiff', () => {
    it('変更のあったフィールドの unified diff セクションを生成する', () => {
        const fromFields = { 金額: { type: 'NUMBER', label: '金額', code: '金額', required: false } };
        const toFields   = { 金額: { type: 'NUMBER', label: '金額', code: '金額', required: true } };
        const result = diffSchemas(fromFields, toFields);
        const text = formatFullDiff(fromFields, toFields, result);
        expect(text).to.include('## Fields / 金額');
        expect(text).to.include('"required"');
        // unified diff には + / - 行が含まれる
        const hasChange = text.split('\n').some(l => l.startsWith('+') || l.startsWith('-'));
        expect(hasChange).to.be.true;
    });

    it('code プロパティは unified diff から除外される', () => {
        const fromFields = { f: { type: 'SINGLE_LINE_TEXT', label: 'A', code: 'f', required: false } };
        const toFields   = { f: { type: 'SINGLE_LINE_TEXT', label: 'A', code: 'f_renamed', required: true } };
        const result = diffSchemas(fromFields, toFields);
        const text = formatFullDiff(fromFields, toFields, result);
        expect(text).not.to.include('"code"');
        // required の変化は含まれる
        expect(text).to.include('"required"');
    });

    it('noLabel の変化は unified diff に含まれる', () => {
        const fromFields = { f: { type: 'SINGLE_LINE_TEXT', label: 'A', code: 'f', noLabel: false } };
        const toFields   = { f: { type: 'SINGLE_LINE_TEXT', label: 'A', code: 'f', noLabel: true } };
        const result = diffSchemas(fromFields, toFields);
        const text = formatFullDiff(fromFields, toFields, result);
        expect(text).to.include('"noLabel"');
    });

    it('差分がない場合は空文字を返す', () => {
        const fields = { 件名: { type: 'SINGLE_LINE_TEXT', label: '件名' } };
        const result = diffSchemas(fields, fields);
        const text = formatFullDiff(fields, fields, result);
        expect(text.trim()).to.equal('');
    });
});
