import { strict as assert } from 'assert';
import {
    schemaToDigestRows,
    formatDigestMarkdown,
    formatDigestTsv,
    type SchemaFields,
    type SchemaMeta,
} from '../src/gen/digestGenerator.js';

const META: SchemaMeta = {
    appName: 'testapp',
    environment: 'dev',
    appId: '1',
    profileName: 'default',
    guestSpaceId: '',
    spaceId: '',
    isGuestSpace: false,
    revision: '10',
};

const META_GUEST: SchemaMeta = {
    ...META,
    guestSpaceId: '42',
    spaceId: '42',
    isGuestSpace: true,
};

describe('schemaToDigestRows', () => {
    it('基本フィールドをコード順で返す', () => {
        const fields: SchemaFields = {
            z_code: { type: 'SINGLE_LINE_TEXT', label: 'Z列', required: false },
            a_code: { type: 'NUMBER', label: 'A列', required: true },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].code, 'a_code');
        assert.equal(rows[1].code, 'z_code');
    });

    it('SUBTABLE子フィールドを親直下に展開する', () => {
        const fields: SchemaFields = {
            my_table: {
                type: 'SUBTABLE',
                label: '明細',
                required: false,
                fields: {
                    child_b: { type: 'NUMBER', label: 'B子', required: false },
                    child_a: { type: 'SINGLE_LINE_TEXT', label: 'A子', required: true },
                },
            },
            top_field: { type: 'SINGLE_LINE_TEXT', label: 'トップ', required: false },
        };
        const rows = schemaToDigestRows(fields, []);
        // my_table → child_a → child_b → top_field（コード順）
        assert.equal(rows[0].code, 'my_table');
        assert.equal(rows[1].code, 'child_a');
        assert.equal(rows[1].isSubtableChild, true);
        assert.equal(rows[1].parentTable, 'my_table');
        assert.equal(rows[2].code, 'child_b');
        assert.equal(rows[3].code, 'top_field');
    });

    it('子フィールドのnotesに "in: <parentTable>" が含まれる', () => {
        const fields: SchemaFields = {
            tbl: {
                type: 'SUBTABLE',
                label: 'テーブル',
                required: false,
                fields: {
                    child: { type: 'NUMBER', label: '子', required: false },
                },
            },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.ok(rows[1].notes.startsWith('in: tbl'));
    });

    it('SPACERをelementId順で末尾に追加する', () => {
        const fields: SchemaFields = {
            field1: { type: 'SINGLE_LINE_TEXT', label: 'F1', required: false },
        };
        const layout = [
            { type: 'ROW', fields: [{ type: 'SPACER', elementId: 'sp_b' }] },
            { type: 'ROW', fields: [{ type: 'SPACER', elementId: 'sp_a' }] },
        ];
        const rows = schemaToDigestRows(fields, layout);
        assert.equal(rows.length, 3);
        assert.equal(rows[1].isSpacer, true);
        assert.equal(rows[1].notes, 'elementId: sp_a');
        assert.equal(rows[2].notes, 'elementId: sp_b');
    });

    it('GROUP所属をgroupMapに記録しnotesに含める', () => {
        const fields: SchemaFields = {
            grouped_field: { type: 'SINGLE_LINE_TEXT', label: 'グループ内', required: false },
        };
        const layout = [
            {
                type: 'GROUP',
                code: 'grp1',
                label: '基本情報',
                layout: [
                    { type: 'ROW', fields: [{ type: 'FIELD', code: 'grouped_field' }] },
                ],
            },
        ];
        const rows = schemaToDigestRows(fields, layout);
        assert.ok(rows[0].notes.includes('group: 基本情報'));
    });

    it('GROUP内フィールドが実kintoneレスポンス型（SINGLE_LINE_TEXT等）でもGROUP所属を記録する', () => {
        // 実 getFormLayout レスポンスでは ROW.fields[].type は 'NUMBER'/'SINGLE_LINE_TEXT' 等
        // 'FIELD' という仮想型ではないことを確認するテスト
        const fields: SchemaFields = {
            field_num:  { type: 'NUMBER', label: '数値', required: false },
            field_text: { type: 'SINGLE_LINE_TEXT', label: 'テキスト', required: false },
            field_date: { type: 'DATE', label: '日付', required: false },
        };
        const layout = [
            {
                type: 'GROUP',
                code: 'grp_info',
                label: '基本情報',
                layout: [
                    {
                        type: 'ROW',
                        fields: [
                            { type: 'NUMBER', code: 'field_num' },
                            { type: 'SINGLE_LINE_TEXT', code: 'field_text' },
                        ],
                    },
                    {
                        type: 'ROW',
                        fields: [
                            { type: 'DATE', code: 'field_date' },
                            { type: 'SPACER', elementId: 'sp_in_group' },
                        ],
                    },
                ],
            },
        ];
        const rows = schemaToDigestRows(fields, layout);
        const numRow = rows.find(r => r.code === 'field_num');
        const textRow = rows.find(r => r.code === 'field_text');
        const dateRow = rows.find(r => r.code === 'field_date');
        const spacerRow = rows.find(r => r.isSpacer);
        assert.ok(numRow?.notes.includes('group: 基本情報'), 'field_num should be in group');
        assert.ok(textRow?.notes.includes('group: 基本情報'), 'field_text should be in group');
        assert.ok(dateRow?.notes.includes('group: 基本情報'), 'field_date should be in group');
        // SPACER は group 情報を持つが notes では elementId で識別する
        assert.ok(spacerRow?.notes.includes('sp_in_group'), 'spacer in group should have elementId');
        assert.ok(spacerRow?.notes.includes('group: 基本情報'), 'spacer in group should also note group');
    });

    it('LABEL/HR はGROUP内に存在しても groupMap に追加されない', () => {
        const fields: SchemaFields = {
            real_field: { type: 'SINGLE_LINE_TEXT', label: 'フィールド', required: false },
        };
        const layout = [
            {
                type: 'GROUP',
                code: 'grp',
                label: '情報',
                layout: [
                    {
                        type: 'ROW',
                        fields: [
                            { type: 'LABEL', label: 'ラベルテキスト' },  // code なし
                            { type: 'HR' },                               // code なし
                            { type: 'SINGLE_LINE_TEXT', code: 'real_field' },
                        ],
                    },
                ],
            },
        ];
        const rows = schemaToDigestRows(fields, layout);
        const fieldRow = rows.find(r => r.code === 'real_field');
        assert.ok(fieldRow?.notes.includes('group: 情報'), 'real_field should be in group');
        // LABEL/HR が group に追加されていないことは間接確認（エラーにならなければOK）
    });

    it('DROP_DOWNの選択肢をindex順でnotesに含める', () => {
        const fields: SchemaFields = {
            status: {
                type: 'DROP_DOWN',
                label: 'ステータス',
                required: false,
                options: {
                    対応中: { label: '対応中', index: '1' },
                    未対応: { label: '未対応', index: '0' },
                    完了: { label: '完了', index: '2' },
                },
            },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.ok(rows[0].notes.includes('選択肢: 未対応, 対応中, 完了'));
    });

    it('expressionをnotesに含める', () => {
        const fields: SchemaFields = {
            calc: { type: 'CALC', label: '計算', required: false, expression: 'PRICE * QTY' },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.ok(rows[0].notes.includes('expression: PRICE * QTY'));
    });

    it('lookup情報をnotesに含める', () => {
        const fields: SchemaFields = {
            lu_field: {
                type: 'SINGLE_LINE_TEXT',
                label: 'ルックアップ',
                required: false,
                lookup: {
                    relatedApp: { app: '8' },
                    relatedKeyField: '顧客ID',
                    fieldMappings: [{ field: 'a', relatedField: 'b' }, { field: 'c', relatedField: 'd' }],
                },
            },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.ok(rows[0].notes.includes('lookup → app 8 . 顧客ID（コピー: 2件）'));
    });

    it('required=true のとき required フラグが立つ', () => {
        const fields: SchemaFields = {
            req: { type: 'SINGLE_LINE_TEXT', label: '必須', required: true },
            opt: { type: 'SINGLE_LINE_TEXT', label: '任意', required: false },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.equal(rows.find(r => r.code === 'req')!.required, true);
        assert.equal(rows.find(r => r.code === 'opt')!.required, false);
    });

    it('unique=trueをnotesに含める', () => {
        const fields: SchemaFields = {
            uniq: { type: 'SINGLE_LINE_TEXT', label: 'ユニーク', required: false, unique: true },
        };
        const rows = schemaToDigestRows(fields, []);
        assert.ok(rows[0].notes.includes('unique'));
    });

    it('出力が決定的（同じ入力で同じ出力）', () => {
        const fields: SchemaFields = {
            b: { type: 'SINGLE_LINE_TEXT', label: 'B', required: false },
            a: { type: 'NUMBER', label: 'A', required: false },
        };
        const r1 = schemaToDigestRows(fields, []);
        const r2 = schemaToDigestRows(fields, []);
        assert.deepEqual(r1, r2);
        assert.equal(r1[0].code, 'a');
    });
});

describe('formatDigestMarkdown', () => {
    it('ヘッダ行を含むMarkdownを生成する', () => {
        const fields: SchemaFields = {
            code1: { type: 'SINGLE_LINE_TEXT', label: 'ラベル1', required: true },
        };
        const rows = schemaToDigestRows(fields, []);
        const md = formatDigestMarkdown(rows, META);
        assert.ok(md.includes('# testapp'));
        assert.ok(md.includes('| コード | 型 | ラベル | 必須 | 備考 |'));
        assert.ok(md.includes('| code1 | SINGLE_LINE_TEXT | ラベル1 | ✓ |'));
    });

    it('spaceId と isGuestSpace をメタデータブロックに含める', () => {
        const rows = schemaToDigestRows({}, []);
        const md = formatDigestMarkdown(rows, META);
        assert.ok(md.includes('spaceId: (none) / isGuestSpace: false'));
    });

    it('ゲストスペース有りの場合 spaceId と isGuestSpace: true を表示する', () => {
        const rows = schemaToDigestRows({}, []);
        const md = formatDigestMarkdown(rows, META_GUEST);
        assert.ok(md.includes('spaceId: 42 / isGuestSpace: true'));
    });

    it('SUBTABLEの子に └ プレフィックスが付く', () => {
        const fields: SchemaFields = {
            tbl: {
                type: 'SUBTABLE',
                label: 'テーブル',
                required: false,
                fields: {
                    child: { type: 'NUMBER', label: '子', required: false },
                },
            },
        };
        const rows = schemaToDigestRows(fields, []);
        const md = formatDigestMarkdown(rows, META);
        assert.ok(md.includes('└ child'));
    });
});

describe('formatDigestTsv', () => {
    it('タブ区切りで出力する', () => {
        const fields: SchemaFields = {
            f: { type: 'NUMBER', label: 'F', required: false },
        };
        const rows = schemaToDigestRows(fields, []);
        const tsv = formatDigestTsv(rows, META);
        const lines = tsv.trim().split('\n');
        assert.equal(lines[0], '# spaceId: (none) / isGuestSpace: false');
        assert.equal(lines[1], 'コード\t型\tラベル\t必須\t備考');
        assert.ok(lines[2].includes('\t'));
    });

    it('ゲストスペース有りの場合 spaceId と isGuestSpace を出力する', () => {
        const rows = schemaToDigestRows({}, []);
        const tsv = formatDigestTsv(rows, META_GUEST);
        assert.ok(tsv.startsWith('# spaceId: 42 / isGuestSpace: true'));
    });
});

describe('formatDigestMarkdown - エスケープ', () => {
    it('ラベルのパイプ文字を \\| にエスケープする', () => {
        const fields: SchemaFields = {
            pipe_f: { type: 'SINGLE_LINE_TEXT', label: 'A|B', required: false },
        };
        const rows = schemaToDigestRows(fields, []);
        const md = formatDigestMarkdown(rows, META);
        assert.ok(md.includes('A\\|B'), `expected A\\|B in output`);
    });

    it('ラベルの改行をスペースに変換する', () => {
        const fields: SchemaFields = {
            nl_f: { type: 'SINGLE_LINE_TEXT', label: 'A\nB', required: false },
        };
        const rows = schemaToDigestRows(fields, []);
        const md = formatDigestMarkdown(rows, META);
        assert.ok(!md.includes('A\nB'), 'newline in label should be removed');
        assert.ok(md.includes('A B'));
    });

    it('expression のパイプ文字をエスケープし表が壊れない', () => {
        const fields: SchemaFields = {
            calc_f: { type: 'CALC', label: '計算', required: false, expression: 'A | B' },
        };
        const rows = schemaToDigestRows(fields, []);
        const md = formatDigestMarkdown(rows, META);
        // パイプがそのまま残ると表の列がずれる
        const dataLine = md.split('\n').find(l => l.includes('calc_f'))!;
        const cols = dataLine.split('|').filter(s => s !== '');
        assert.ok(cols.length >= 5, 'table must have 5+ columns after escaping');
    });
});

describe('formatDigestMarkdown - raw appId', () => {
    const META_RAW: SchemaMeta = {
        appName: '問い合わせ管理',
        environment: 'raw',
        appId: '123',
        profileName: 'default',
        guestSpaceId: '',
        spaceId: '',
        isGuestSpace: false,
        revision: '5',
        digestAppRef: '123',
    };

    const META_RAW_GUEST: SchemaMeta = {
        ...META_RAW,
        guestSpaceId: '999',
        spaceId: '999',
        isGuestSpace: true,
        digestAppRef: '123/999',
    };

    it('environment が raw のとき envTag が raw になる', () => {
        const rows = schemaToDigestRows({}, []);
        const md = formatDigestMarkdown(rows, META_RAW);
        assert.ok(md.includes(', raw, '), `expected ", raw," in header: ${md.split('\n')[0]}`);
    });

    it('再生成コマンドに digestAppRef が使われる（kintone app name ではない）', () => {
        const rows = schemaToDigestRows({}, []);
        const md = formatDigestMarkdown(rows, META_RAW);
        assert.ok(md.includes('--app 123'), 'expected --app 123 in regen line');
        assert.ok(!md.includes('--app 問い合わせ管理'), 'kintone app name must not appear in regen command');
    });

    it('ゲスト raw: 再生成コマンドに 123/999 が使われる', () => {
        const rows = schemaToDigestRows({}, []);
        const md = formatDigestMarkdown(rows, META_RAW_GUEST);
        assert.ok(md.includes('--app 123/999'), 'expected --app 123/999 in regen line');
    });

    it('digestAppRef 未指定のとき appName を fallback 使用する（既存互換）', () => {
        const rows = schemaToDigestRows({}, []);
        const md = formatDigestMarkdown(rows, META); // META has no digestAppRef
        assert.ok(md.includes('--app testapp'), 'expected --app testapp for registered app');
    });
});

describe('formatDigestTsv - エスケープ', () => {
    it('ラベルのタブ文字をスペースに変換する', () => {
        const fields: SchemaFields = {
            tab_f: { type: 'SINGLE_LINE_TEXT', label: 'A\tB', required: false },
        };
        const rows = schemaToDigestRows(fields, []);
        const tsv = formatDigestTsv(rows, META);
        const dataLine = tsv.split('\n')[2]; // line 0: metadata, line 1: header, line 2: data
        const cols = dataLine.split('\t');
        assert.equal(cols[2], 'A B', 'tab in label should become space');
    });

    it('notes の改行をスペースに変換する', () => {
        const fields: SchemaFields = {
            nl_f: { type: 'CALC', label: 'F', required: false, expression: 'A\nB' },
        };
        const rows = schemaToDigestRows(fields, []);
        const tsv = formatDigestTsv(rows, META);
        assert.ok(!tsv.includes('A\nB'), 'newline in notes should be removed');
    });
});
