import { describe, it } from 'mocha';
import { expect } from 'chai';
import { buildDevToProdMap, remapLookupAppIds, validateLayoutCodes, sanitizeViewsForUpdate } from '../src/utils/schemaWriter.js';
import type { Customization } from '../src/models.js';

const makeCustom = (appName: string, devId: string, prodId: string): Customization => ({
    appName,
    development: { profileName: 'dev', appId: devId, guestSpaceId: '', status: 'local', baseUrl: 'https://example.cybozu.com' },
    production:  { profileName: 'prod', appId: prodId, guestSpaceId: '', status: 'local', baseUrl: 'https://example.cybozu.com' },
});

describe('buildDevToProdMap', () => {
    it('dev/prod appId が異なる場合にマップエントリを作る', () => {
        const customs = {
            '受注管理': makeCustom('受注管理', '10', '20'),
            '顧客DB':   makeCustom('顧客DB',   '11', '21'),
        };
        const map = buildDevToProdMap(customs);
        expect(map.get('10')).to.equal('20');
        expect(map.get('11')).to.equal('21');
    });

    it('dev と prod が同じ appId の場合はエントリを作らない', () => {
        const customs = { テスト: makeCustom('テスト', '5', '5') };
        const map = buildDevToProdMap(customs);
        expect(map.has('5')).to.be.false;
    });

    it('複数アプリがあるとき全アプリ分のマップを返す', () => {
        const customs = {
            A: makeCustom('A', '1', '10'),
            B: makeCustom('B', '2', '20'),
            C: makeCustom('C', '3', '30'),
        };
        const map = buildDevToProdMap(customs);
        expect(map.size).to.equal(3);
    });
});

describe('remapLookupAppIds', () => {
    it('lookup.relatedApp.app を dev→prod に置換する', () => {
        const fields = {
            LU_顧客: {
                type: 'NUMBER',
                lookup: { relatedApp: { app: '10' }, relatedKeyField: '顧客ID' },
            },
        };
        const map = new Map([['10', '20']]);
        const { remapped, mappedCodes } = remapLookupAppIds(fields, map);
        expect(remapped['LU_顧客'].lookup.relatedApp.app).to.equal('20');
        expect(mappedCodes).to.include('LU_顧客');
    });

    it('管理外アプリへの lookup は unmappedCodes に追加される', () => {
        const fields = {
            LU_外部: {
                type: 'NUMBER',
                lookup: { relatedApp: { app: '999' }, relatedKeyField: 'ID' },
            },
        };
        const map = new Map([['10', '20']]);  // 999 はマップにない
        const { remapped, unmappedCodes } = remapLookupAppIds(fields, map);
        expect(remapped['LU_外部'].lookup.relatedApp.app).to.equal('999');  // 変化なし
        expect(unmappedCodes).to.include('LU_外部');
    });

    it('REFERENCE_TABLE の relatedApp.app もリマップされる', () => {
        const fields = {
            REL_受注: {
                type: 'REFERENCE_TABLE',
                referenceTable: { relatedApp: { app: '11' }, condition: {} },
            },
        };
        const map = new Map([['11', '21']]);
        const { remapped, mappedCodes } = remapLookupAppIds(fields, map);
        expect(remapped['REL_受注'].referenceTable.relatedApp.app).to.equal('21');
        expect(mappedCodes).to.include('REL_受注');
    });

    it('lookup のないフィールドは変更されない', () => {
        const fields = {
            件名: { type: 'SINGLE_LINE_TEXT', label: '件名' },
            金額: { type: 'NUMBER', label: '金額' },
        };
        const map = new Map([['10', '20']]);
        const { remapped, mappedCodes, unmappedCodes } = remapLookupAppIds(fields, map);
        expect(remapped['件名']).to.deep.equal(fields['件名']);
        expect(mappedCodes).to.have.length(0);
        expect(unmappedCodes).to.have.length(0);
    });

    it('元のオブジェクトを変更しない（純粋関数）', () => {
        const fields = {
            LU: { type: 'NUMBER', lookup: { relatedApp: { app: '10' } } },
        };
        const original = JSON.stringify(fields);
        const map = new Map([['10', '20']]);
        remapLookupAppIds(fields, map);
        expect(JSON.stringify(fields)).to.equal(original);
    });

    it('SUBTABLE 子フィールドの lookup.relatedApp.app もリマップされる', () => {
        const fields = {
            明細テーブル: {
                type: 'SUBTABLE',
                fields: {
                    LU_子: {
                        type: 'NUMBER',
                        lookup: { relatedApp: { app: '10' }, relatedKeyField: 'ID' },
                    },
                },
            },
        };
        const map = new Map([['10', '20']]);
        const { remapped, mappedCodes } = remapLookupAppIds(fields, map);
        expect(remapped['明細テーブル'].fields['LU_子'].lookup.relatedApp.app).to.equal('20');
        expect(mappedCodes).to.include('LU_子');
    });

    it('SUBTABLE 子の unmapped lookup は unmappedCodes に追加される', () => {
        const fields = {
            テーブル: {
                type: 'SUBTABLE',
                fields: {
                    LU_外部: {
                        type: 'NUMBER',
                        lookup: { relatedApp: { app: '999' }, relatedKeyField: 'ID' },
                    },
                },
            },
        };
        const map = new Map([['10', '20']]);
        const { unmappedCodes } = remapLookupAppIds(fields, map);
        expect(unmappedCodes).to.include('LU_外部');
    });
});

describe('validateLayoutCodes', () => {
    it('layout のコードがすべて fields に存在する場合は空配列を返す', () => {
        const fields = {
            件名: { type: 'SINGLE_LINE_TEXT', label: '件名' },
            金額: { type: 'NUMBER', label: '金額' },
        };
        const layout = [
            { type: 'ROW', fields: [{ type: 'SINGLE_LINE_TEXT', code: '件名' }] },
            { type: 'ROW', fields: [{ type: 'NUMBER', code: '金額' }] },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.have.length(0);
    });

    it('存在しないコードが含まれる場合にそのコードを返す', () => {
        const fields = { 件名: { type: 'SINGLE_LINE_TEXT' } };
        const layout = [
            { type: 'ROW', fields: [{ type: 'SINGLE_LINE_TEXT', code: '件名' }] },
            { type: 'ROW', fields: [{ type: 'NUMBER', code: '削除済みフィールド' }] },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.include('削除済みフィールド');
    });

    it('GROUP 内のコードも検証される', () => {
        const fields = { 件名: { type: 'SINGLE_LINE_TEXT' } };
        const layout = [
            {
                type: 'GROUP',
                code: 'grp',
                layout: [
                    { type: 'ROW', fields: [{ type: 'SINGLE_LINE_TEXT', code: '存在しないフィールド' }] },
                ],
            },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.include('存在しないフィールド');
    });

    it('SPACER は検証対象外', () => {
        const fields = { 件名: { type: 'SINGLE_LINE_TEXT' } };
        const layout = [
            { type: 'ROW', fields: [{ type: 'SPACER', elementId: 'sp_1' }] },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.have.length(0);
    });

    it('SUBTABLE 子フィールドのコードは有効として扱われる', () => {
        const fields = {
            明細テーブル: {
                type: 'SUBTABLE',
                fields: {
                    明細金額: { type: 'NUMBER' },
                },
            },
        };
        const layout = [
            { type: 'ROW', fields: [{ type: 'NUMBER', code: '明細金額' }] },
        ];
        // SUBTABLE 子は allCodes に含まれるため invalid にならない
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.have.length(0);
    });

    it('トップレベル SUBTABLE アイテムのコードが fields に存在する場合は有効', () => {
        const fields = {
            明細テーブル: { type: 'SUBTABLE', fields: { 明細金額: { type: 'NUMBER' } } },
        };
        const layout = [
            { type: 'SUBTABLE', code: '明細テーブル', fields: [{ type: 'NUMBER', code: '明細金額' }] },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.have.length(0);
    });

    it('トップレベル SUBTABLE コードが存在しない場合は invalid に追加される', () => {
        const fields: Record<string, any> = {};
        const layout = [
            { type: 'SUBTABLE', code: '存在しないテーブル', fields: [] },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.include('存在しないテーブル');
    });

    it('SUBTABLE 内の存在しないフィールドコードも invalid に追加される', () => {
        const fields = {
            明細テーブル: { type: 'SUBTABLE', fields: {} },
        };
        const layout = [
            { type: 'SUBTABLE', code: '明細テーブル', fields: [{ type: 'NUMBER', code: '削除済み子フィールド' }] },
        ];
        const invalid = validateLayoutCodes(layout, fields);
        expect(invalid).to.include('削除済み子フィールド');
    });
});

describe('sanitizeViewsForUpdate', () => {
    it('各 view の id プロパティを除去する', () => {
        const views = {
            テストビュー: { type: 'LIST', name: 'テストビュー', id: '13455926', filterCond: '', sort: 'レコード番号 desc' },
        };
        const sanitized = sanitizeViewsForUpdate(views);
        expect(sanitized['テストビュー']).not.to.have.property('id');
        expect(sanitized['テストビュー'].name).to.equal('テストビュー');
        expect(sanitized['テストビュー'].filterCond).to.equal('');
    });

    it('id がない view はそのまま返す', () => {
        const views = {
            ビューA: { type: 'LIST', name: 'ビューA', filterCond: '数値 > 0', sort: 'レコード番号 asc' },
        };
        const sanitized = sanitizeViewsForUpdate(views);
        expect(sanitized['ビューA']).to.deep.equal(views['ビューA']);
    });

    it('複数 view がある場合すべての id を除去する', () => {
        const views = {
            view1: { type: 'LIST', name: 'view1', id: '111', filterCond: '' },
            view2: { type: 'LIST', name: 'view2', id: '222', filterCond: '' },
        };
        const sanitized = sanitizeViewsForUpdate(views);
        expect(sanitized['view1']).not.to.have.property('id');
        expect(sanitized['view2']).not.to.have.property('id');
    });

    it('元のオブジェクトを変更しない（純粋関数）', () => {
        const views = {
            v: { type: 'LIST', name: 'v', id: '999', filterCond: '' },
        };
        const original = JSON.stringify(views);
        sanitizeViewsForUpdate(views);
        expect(JSON.stringify(views)).to.equal(original);
    });
});
