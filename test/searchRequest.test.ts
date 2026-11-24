import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
    buildConditions,
    buildSearchRequest,
    parseEndpoint,
    parseLimit,
    parseScope,
    parseSort,
    parseTypes,
    searchPath,
    splitList,
    validateConditions,
    validateDateRange,
} from '../src/search/request.js';

describe('splitList', () => {
    it('カンマで分け、前後の空白と空要素を捨てる', () => {
        expect(splitList(' a, b ,,c ')).to.deep.equal(['a', 'b', 'c']);
    });
});

describe('buildConditions', () => {
    it('位置引数は1つの AND 条件になる', () => {
        expect(buildConditions(['abc', 'def'], {})).to.deep.equal([
            { operator: 'AND', keywords: ['abc', 'def'] },
        ]);
    });

    it('--or を2回指定すると OR 条件が2つになる', () => {
        expect(buildConditions([], { or: ['a,b', 'c,d'] })).to.deep.equal([
            { operator: 'OR', keywords: ['a', 'b'] },
            { operator: 'OR', keywords: ['c', 'd'] },
        ]);
    });

    it('位置引数・--and・--or・--not の順に並ぶ', () => {
        const conditions = buildConditions(['x'], { and: ['y'], or: ['z'], not: ['w'] });
        expect(conditions.map(c => c.operator)).to.deep.equal(['AND', 'AND', 'OR', 'NOT']);
    });

    it('空の値は条件にしない', () => {
        expect(buildConditions(['  '], { or: [','] })).to.deep.equal([]);
    });
});

describe('validateConditions', () => {
    it('条件が無ければエラー', () => {
        expect(validateConditions([])).to.have.length(1);
    });

    it('NOT だけならエラー（kintone は空の結果を返すため）', () => {
        const errors = validateConditions([{ operator: 'NOT', keywords: ['a'] }]);
        expect(errors.join()).to.include('AND or OR');
    });

    it('検索語が全体で21個ならエラー', () => {
        const keywords = Array.from({ length: 21 }, (_, i) => `k${i}`);
        const errors = validateConditions([{ operator: 'AND', keywords }]);
        expect(errors.join()).to.include('max is 20 in total');
    });

    it('検索語が全体で20個なら通る', () => {
        const keywords = Array.from({ length: 20 }, (_, i) => `k${i}`);
        expect(validateConditions([{ operator: 'AND', keywords }])).to.deep.equal([]);
    });

    it('51文字の検索語はエラー、50文字は通る', () => {
        expect(validateConditions([{ operator: 'AND', keywords: ['あ'.repeat(51)] }])).to.have.length(1);
        expect(validateConditions([{ operator: 'AND', keywords: ['あ'.repeat(50)] }])).to.deep.equal([]);
    });
});

describe('parseTypes', () => {
    it('大文字小文字を問わず受け取り、重複を除く', () => {
        expect(parseTypes('record, Attachment,RECORD')).to.deep.equal({ types: ['RECORD', 'ATTACHMENT'], errors: [] });
    });

    it('知らない種類はエラー', () => {
        expect(parseTypes('record,foo').errors).to.have.length(1);
    });
});

describe('parseScope', () => {
    it('未指定なら範囲なし', () => {
        expect(parseScope('APP', undefined, '--app')).to.deep.equal({ errors: [] });
    });

    it('値なし（true）ならその種類のすべて', () => {
        expect(parseScope('APP', true, '--app')).to.deep.equal({ scope: { scope: 'APP' }, errors: [] });
    });

    it('APP は ids に入る', () => {
        expect(parseScope('APP', '1,2', '--app')).to.deep.equal({ scope: { scope: 'APP', ids: ['1', '2'] }, errors: [] });
    });

    it('APP に数値でない値はエラー', () => {
        expect(parseScope('APP', '1,abc', '--app').errors).to.have.length(1);
    });

    it('PEOPLE は codes に入る', () => {
        expect(parseScope('PEOPLE', 'user1,user2', '--people')).to.deep.equal({
            scope: { scope: 'PEOPLE', codes: ['user1', 'user2'] },
            errors: [],
        });
    });

    it('21個はエラー', () => {
        const ids = Array.from({ length: 21 }, (_, i) => String(i + 1)).join(',');
        expect(parseScope('SPACE', ids, '--space').errors.join()).to.include('max is 20');
    });
});

describe('parseSort', () => {
    it('どちらも未指定なら undefined', () => {
        expect(parseSort(undefined, undefined)).to.deep.equal({ errors: [] });
    });

    it('created asc', () => {
        expect(parseSort('created', 'asc')).to.deep.equal({ sort: { by: 'CREATED_AT', order: 'ASC' }, errors: [] });
    });

    it('--order だけなら relevance desc を補う', () => {
        expect(parseSort(undefined, 'desc')).to.deep.equal({ sort: { by: 'RELEVANCE', order: 'DESC' }, errors: [] });
    });

    it('relevance と asc の組み合わせはエラー', () => {
        expect(parseSort('relevance', 'asc').errors).to.have.length(1);
    });

    it('知らない値はエラー', () => {
        expect(parseSort('name', 'up').errors).to.have.length(2);
    });
});

describe('parseLimit', () => {
    it('1〜20 は通る', () => {
        expect(parseLimit('1')).to.deep.equal({ limit: 1, errors: [] });
        expect(parseLimit('20')).to.deep.equal({ limit: 20, errors: [] });
    });

    it('0・21・小数・文字はエラー', () => {
        for (const v of ['0', '21', '1.5', 'abc']) {
            expect(parseLimit(v).errors, v).to.have.length(1);
        }
    });
});

describe('validateDateRange', () => {
    it('after が before より新しいとエラー', () => {
        expect(validateDateRange('2026-06-01T00:00:00+09:00', '2026-05-01T00:00:00+09:00')).to.have.length(1);
    });

    it('同じ日時は通る', () => {
        const t = '2026-05-01T00:00:00+09:00';
        expect(validateDateRange(t, t)).to.deep.equal([]);
    });

    it('日時として読めなければエラー', () => {
        expect(validateDateRange('yesterday', undefined)).to.have.length(1);
    });
});

describe('parseEndpoint / searchPath', () => {
    it('未指定なら通常のパス', () => {
        const { endpoint } = parseEndpoint(undefined);
        expect(searchPath(endpoint!)).to.equal('/k/v1/search.json');
    });

    it('値なしなら参加しているすべてのゲストスペース', () => {
        const { endpoint } = parseEndpoint(true);
        expect(searchPath(endpoint!)).to.equal('/k/guest/v1/search.json');
    });

    it('ID ありならそのゲストスペース', () => {
        const { endpoint } = parseEndpoint('7');
        expect(searchPath(endpoint!)).to.equal('/k/guest/7/v1/search.json');
    });

    it('数値でない ID はエラー', () => {
        expect(parseEndpoint('abc').errors).to.have.length(1);
    });
});

describe('buildSearchRequest', () => {
    it('キーワードだけなら query だけのボディになる', () => {
        expect(buildSearchRequest(['abc', 'def'], {})).to.deep.equal({
            ok: true,
            request: { query: [{ operator: 'AND', keywords: ['abc', 'def'] }] },
        });
    });

    it('全オプションをボディへ写す', () => {
        const r = buildSearchRequest(['abc'], {
            not: ['def'],
            type: 'attachment',
            space: '1',
            excludeApp: '2',
            creator: 'user1',
            after: '2026-05-01T00:00:00+09:00',
            before: '2026-05-31T23:59:59+09:00',
            synonyms: true,
            sort: 'created',
            order: 'asc',
            limit: '10',
            pageToken: 'token',
        });
        expect(r).to.deep.equal({
            ok: true,
            request: {
                query: [
                    { operator: 'AND', keywords: ['abc'] },
                    { operator: 'NOT', keywords: ['def'] },
                ],
                types: ['ATTACHMENT'],
                scopes: [{ scope: 'SPACE', ids: ['1'] }],
                excludeScopes: [{ scope: 'APP', ids: ['2'] }],
                creators: ['user1'],
                createdAfter: '2026-05-01T00:00:00+09:00',
                createdBefore: '2026-05-31T23:59:59+09:00',
                includeSynonyms: true,
                sort: { by: 'CREATED_AT', order: 'ASC' },
                limit: 10,
                pageToken: 'token',
            },
        });
    });

    it('複数の違反をまとめて返す', () => {
        const r = buildSearchRequest([], { type: 'foo', limit: '99' });
        expect(r.ok).to.equal(false);
        if (r.ok) return;
        expect(r.errors).to.have.length(3);
    });
});
