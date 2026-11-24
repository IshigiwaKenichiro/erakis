import { describe, it } from 'mocha';
import { expect } from 'chai';
import { formatCreatedAt, toTableRow, truncate } from '../src/search/format.js';
import { buildSearchHeaders } from '../src/search/api.js';
import type { Profile } from '../src/models.js';

describe('truncate', () => {
    it('改行と連続した空白を1つの空白にする', () => {
        expect(truncate('a\n\n b', 10)).to.equal('a b');
    });

    it('上限を超えたら末尾を … にして上限の長さにそろえる', () => {
        expect(truncate('abcdef', 4)).to.equal('abc…');
    });
});

describe('formatCreatedAt', () => {
    it('日付部分だけにする', () => {
        expect(formatCreatedAt('2025-08-04T06:53:00.000Z')).to.equal('2025-08-04');
    });

    it('null は空欄', () => {
        expect(formatCreatedAt(null)).to.equal('');
    });
});

describe('toTableRow', () => {
    it('作成者が無くても空欄で並べる', () => {
        const row = toTableRow({
            type: 'RECORD', url: 'u', snippets: [], location: 'L', title: 'T', createdAt: null, creator: null, raw: {},
        });
        expect(row).to.deep.equal(['RECORD', 'L', 'T', '', '', '', 'u']);
    });
});

describe('buildSearchHeaders', () => {
    const profile: Profile = {
        name: 'p', baseUrl: 'https://sample.cybozu.com', username: 'user', password: 'pass',
        basicUsername: '', basicPassword: '',
    };

    it('パスワード認証のヘッダーを付ける', () => {
        const headers = buildSearchHeaders(profile);
        expect(headers['X-Cybozu-Authorization']).to.equal(Buffer.from('user:pass').toString('base64'));
        expect(headers).to.not.have.property('Authorization');
    });

    it('Basic 認証があれば Authorization も付ける', () => {
        const headers = buildSearchHeaders({ ...profile, basicUsername: 'b', basicPassword: 'bp' });
        expect(headers['Authorization']).to.equal(`Basic ${Buffer.from('b:bp').toString('base64')}`);
    });
});
