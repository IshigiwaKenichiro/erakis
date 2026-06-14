import { describe, it } from 'mocha';
import { expect } from 'chai';
import { generateReadme, buildMermaidGraph, buildAppSummary } from '../src/gen/docsGenerator.js';
import type { AppSchemaData } from '../src/gen/docsGenerator.js';
import type { Customization } from '../src/models.js';

const makeApp = (
    appName: string,
    appId: string,
    fields: Record<string, any> = {},
    views: Record<string, any> = {},
    layout: any[] = [],
): AppSchemaData => ({
    appName,
    meta: { appName, environment: 'dev', appId, profileName: 'mine', guestSpaceId: '', revision: '1' },
    fields,
    layout,
    views,
});

const makeCustomization = (
    appName: string,
    devAppId: string,
    prodAppId: string,
    baseUrl = 'https://example.cybozu.com',
    guestSpaceId = '',
): Customization => ({
    appName,
    development: { profileName: 'dev-profile', appId: devAppId, guestSpaceId, status: 'local', baseUrl },
    production:  { profileName: 'prod-profile', appId: prodAppId, guestSpaceId, status: 'local', baseUrl },
});

describe('buildAppSummary', () => {
    it('アプリ名がH3見出しとして含まれる', () => {
        const app = makeApp('受注管理', '10');
        const text = buildAppSummary(app);
        expect(text).to.include('### 受注管理');
    });

    it('フィールド型別件数テーブルが含まれる', () => {
        const app = makeApp('テスト', '1', {
            件名: { type: 'SINGLE_LINE_TEXT', label: '件名' },
            金額: { type: 'NUMBER', label: '金額' },
            メモ: { type: 'MULTI_LINE_TEXT', label: 'メモ' },
        });
        const text = buildAppSummary(app);
        expect(text).to.include('SINGLE_LINE_TEXT');
        expect(text).to.include('NUMBER');
        expect(text).to.include('フィールド型別件数');
    });

    it('SUBTABLE が含まれる場合、SUBTABLE一覧が出力される', () => {
        const app = makeApp('テスト', '1', {
            明細テーブル: {
                type: 'SUBTABLE',
                label: '明細',
                fields: {
                    商品コード: { type: 'SINGLE_LINE_TEXT', label: '商品コード' },
                    数量: { type: 'NUMBER', label: '数量' },
                },
            },
        });
        const text = buildAppSummary(app);
        expect(text).to.include('SUBTABLE 一覧');
        expect(text).to.include('明細テーブル');
        expect(text).to.include('子フィールド: 2件');
    });

    it('Views が含まれる場合、Views一覧が出力される', () => {
        const app = makeApp('テスト', '1', {}, {
            '一覧': { type: 'LIST', index: 0 },
            'カレンダー': { type: 'CALENDAR', index: 1 },
        });
        const text = buildAppSummary(app);
        expect(text).to.include('Views 一覧');
        expect(text).to.include('一覧');
        expect(text).to.include('カレンダー');
    });

    it('Views がない場合、Views一覧セクションは出力されない', () => {
        const app = makeApp('テスト', '1');
        const text = buildAppSummary(app);
        expect(text).to.not.include('Views 一覧');
    });
});

describe('buildMermaidGraph', () => {
    it('lookup がないとき空文字を返す', () => {
        const apps = [makeApp('アプリA', '1'), makeApp('アプリB', '2')];
        const result = buildMermaidGraph(apps, {});
        expect(result).to.equal('');
    });

    it('lookup があるとき graph LR を含む', () => {
        const apps = [
            makeApp('アプリA', '1', {
                LU_顧客: { type: 'NUMBER', label: 'ルックアップ', lookup: { relatedApp: { app: '2' } } },
            }),
            makeApp('アプリB', '2'),
        ];
        const result = buildMermaidGraph(apps, {});
        expect(result).to.include('graph LR');
        expect(result).to.include('lookup');
    });

    it('管理外アプリは「外部」ノードとして表現される', () => {
        const apps = [
            makeApp('アプリA', '1', {
                LU_外部: { type: 'NUMBER', label: 'ルックアップ', lookup: { relatedApp: { app: '999' } } },
            }),
        ];
        const result = buildMermaidGraph(apps, {});
        expect(result).to.include('外部');
        expect(result).to.include('999');
    });

    it('REFERENCE_TABLE がある場合も関連エッジが出力される', () => {
        const apps = [
            makeApp('アプリA', '1', {
                REL_B: { type: 'REFERENCE_TABLE', referenceTable: { relatedApp: { app: '2' } } },
            }),
            makeApp('アプリB', '2'),
        ];
        const result = buildMermaidGraph(apps, {});
        expect(result).to.include('ref');
    });

    it('Mermaid ノードIDに日本語が含まれない（n_ プレフィックス + アンダースコア）', () => {
        const apps = [makeApp('受注管理', '10')];
        const result = buildMermaidGraph(apps, {});
        // エッジがなければ空文字が返るので、lookup付きでテスト
        const appsWithLookup = [
            makeApp('受注管理', '10', {
                LU: { type: 'NUMBER', lookup: { relatedApp: { app: '11' } } },
            }),
            makeApp('顧客DB', '11'),
        ];
        const result2 = buildMermaidGraph(appsWithLookup, {});
        expect(result2).to.not.match(/\[受注/);
        expect(result2).to.include('n_');
    });
});

describe('generateReadme', () => {
    it('管理アプリ一覧テーブルが含まれる', () => {
        const apps = [makeApp('受注管理', '10'), makeApp('顧客DB', '11')];
        const text = generateReadme(apps, {});
        expect(text).to.include('管理アプリ一覧');
        expect(text).to.include('受注管理');
        expect(text).to.include('顧客DB');
    });

    it('アプリサマリセクションが含まれる', () => {
        const apps = [makeApp('テスト', '1', { 件名: { type: 'SINGLE_LINE_TEXT', label: '件名' } })];
        const text = generateReadme(apps, {});
        expect(text).to.include('アプリサマリ');
        expect(text).to.include('### テスト');
    });

    it('digest リンクが含まれる', () => {
        const apps = [makeApp('受注管理', '10')];
        const text = generateReadme(apps, {});
        expect(text).to.include('digest');
        expect(text).to.include('.digest.md');
    });

    it('erakis schema docs で再生成できる旨が含まれる', () => {
        const apps = [makeApp('テスト', '1')];
        const text = generateReadme(apps, {});
        expect(text).to.include('erakis schema docs');
    });

    it('apps がlocaleCompare順にソートされる', () => {
        const apps = [makeApp('受注管理', '1'), makeApp('顧客DB', '2')];
        const text = generateReadme(apps, {});
        const sorted = ['受注管理', '顧客DB'].sort((a, b) => a.localeCompare(b));
        const idxFirst = text.indexOf(sorted[0]);
        const idxSecond = text.indexOf(sorted[1]);
        expect(idxFirst).to.be.lessThan(idxSecond);
    });
});

describe('generateReadme - dev/prod 情報', () => {
    it('管理アプリ一覧に dev appId がリンクとして含まれる', () => {
        const apps = [makeApp('受注管理', '10')];
        const customs = { '受注管理': makeCustomization('受注管理', '10', '20') };
        const text = generateReadme(apps, customs);
        expect(text).to.include('[10]');
        expect(text).to.include('/k/10');
    });

    it('管理アプリ一覧に prod appId がリンクとして含まれる', () => {
        const apps = [makeApp('受注管理', '10')];
        const customs = { '受注管理': makeCustomization('受注管理', '10', '20') };
        const text = generateReadme(apps, customs);
        expect(text).to.include('[20]');
        expect(text).to.include('/k/20');
    });

    it('dev/prod の profile 名が含まれる', () => {
        const apps = [makeApp('受注管理', '10')];
        const customs = { '受注管理': makeCustomization('受注管理', '10', '20') };
        const text = generateReadme(apps, customs);
        expect(text).to.include('dev-profile');
        expect(text).to.include('prod-profile');
    });

    it('guestSpaceId がある場合 URL が /k/guest/<guestSpaceId>/<appId> 形式になる', () => {
        const apps = [makeApp('ゲスト', '5')];
        const customs = { 'ゲスト': makeCustomization('ゲスト', '5', '6', 'https://example.cybozu.com', '99') };
        const text = generateReadme(apps, customs);
        expect(text).to.include('/k/guest/99/5');
        expect(text).to.include('/k/guest/99/6');
    });

    it('customizations にエントリがない場合でも生成できる（空セルになる）', () => {
        const apps = [makeApp('単独アプリ', '1')];
        // customizations は空（旧形式や手動 schema pull 後を想定）
        expect(() => generateReadme(apps, {})).to.not.throw();
        const text = generateReadme(apps, {});
        expect(text).to.include('単独アプリ');
    });
});

// ---- Phase F: dev/prod revision ----

describe('generateReadme - dev/prod revision columns', () => {
    it('テーブルヘッダーに dev rev と prod rev が含まれる', () => {
        const apps = [makeApp('受注管理', '10')];
        const text = generateReadme(apps, {});
        expect(text).to.include('dev rev');
        expect(text).to.include('prod rev');
    });

    it('devRevision と prodRevision が両方テーブルセルに出力される', () => {
        const apps: AppSchemaData[] = [{
            ...makeApp('受注管理', '10'),
            devRevision: '5',
            prodRevision: '3',
        }];
        const text = generateReadme(apps, {});
        // テーブルの同一行に両値が含まれる
        const tableLine = text.split('\n').find(l => l.includes('受注管理') && l.includes('|'));
        expect(tableLine).to.include('5');
        expect(tableLine).to.include('3');
    });

    it('devRevision のみで prodRevision 未指定でも生成できる', () => {
        const apps: AppSchemaData[] = [{
            ...makeApp('受注管理', '10'),
            devRevision: '7',
        }];
        expect(() => generateReadme(apps, {})).to.not.throw();
        const text = generateReadme(apps, {});
        const tableLine = text.split('\n').find(l => l.includes('受注管理') && l.includes('|'));
        expect(tableLine).to.include('7');
    });

    it('devRevision も prodRevision も未指定なら空セルになる', () => {
        const apps = [makeApp('受注管理', '10')];
        const text = generateReadme(apps, {});
        // revision カラムが空文字で出力（エラーにならない）
        const tableLine = text.split('\n').find(l => l.includes('受注管理') && l.includes('|'));
        expect(tableLine).to.be.a('string');
    });
});
