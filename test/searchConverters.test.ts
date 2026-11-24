import { describe, it } from 'mocha';
import { expect } from 'chai';
import { toSearchHit, toSearchResult } from '../src/search/converters.js';

const user = (code: string) => ({ code, name: `name-${code}` });

describe('toSearchHit', () => {
    it('RECORD はスペース名とアプリ名を場所に、レコード番号とタイトルを見出しにする', () => {
        const hit = toSearchHit({
            type: 'RECORD',
            url: 'https://sample.cybozu.com/k/1/show#record=5',
            snippets: ['abc'],
            record: {
                appId: '1', appName: '案件管理', recordId: '5', recordTitle: '見積',
                createdAt: '2025-08-04T06:53:00.000Z', creator: user('u1'),
                matchedFields: [], spaceId: '18', spaceName: '営業本部',
            },
        });
        expect(hit).to.include({ type: 'RECORD', location: '営業本部 / 案件管理', title: '#5 見積', createdAt: '2025-08-04T06:53:00.000Z' });
        expect(hit.creator).to.deep.equal(user('u1'));
        expect(hit.snippets).to.deep.equal(['abc']);
    });

    it('スペース外のレコードはアプリ名だけ。権限が無い作成者・作成日時は null', () => {
        const hit = toSearchHit({
            type: 'RECORD', url: '', snippets: [],
            record: { appName: 'ファイル管理', recordId: '329', recordTitle: '329', createdAt: null, creator: null, spaceName: null },
        });
        expect(hit.location).to.equal('ファイル管理');
        expect(hit.creator).to.equal(null);
        expect(hit.createdAt).to.equal(null);
    });

    it('ATTACHMENT は添付先から場所を、ファイルから見出し・作成者を取る', () => {
        const hit = toSearchHit({
            type: 'ATTACHMENT', url: '', snippets: [],
            record: { appName: 'ファイル管理', recordId: '329', recordTitle: '329', createdAt: '2025-01-01T00:00:00Z', creator: user('u1'), spaceName: null },
            attachment: { attachedTo: 'RECORD', fileKey: 'k', name: '予算.xlsx', createdAt: '2025-08-04T06:53:00.000Z', creator: user('u2') },
        });
        expect(hit).to.include({ location: 'ファイル管理', title: '予算.xlsx', createdAt: '2025-08-04T06:53:00.000Z' });
        expect(hit.creator).to.deep.equal(user('u2'));
    });

    it('THREAD_COMMENT はスペース名とスレッド名を場所にし、返信なら返信IDも出す', () => {
        const hit = toSearchHit({
            type: 'THREAD_COMMENT', url: '', snippets: [],
            threadComment: { commentId: '10', replyId: '11', spaceName: 'S', threadName: 'T', createdAt: 'x', creator: user('u1') },
        });
        expect(hit).to.include({ location: 'S / T', title: 'comment 10 reply 11' });
    });

    it('PEOPLE_COMMENT は所有者を場所にする', () => {
        const hit = toSearchHit({
            type: 'PEOPLE_COMMENT', url: '', snippets: [],
            peopleComment: { commentId: '1', replyId: null, owner: user('u3'), createdAt: 'x', creator: user('u4') },
        });
        expect(hit).to.include({ location: 'people: name-u3', title: 'comment 1' });
    });

    it('MESSAGE_COMMENT は受信者を場所にする', () => {
        const hit = toSearchHit({
            type: 'MESSAGE_COMMENT', url: '', snippets: [],
            messageComment: { commentId: '2', createdAt: 'x', creator: user('u1'), recipient: user('u2') },
        });
        expect(hit.location).to.equal('message: name-u2');
    });

    it('SPACE と THREAD', () => {
        expect(toSearchHit({ type: 'SPACE', url: '', snippets: [], space: { spaceName: '営業', createdAt: 'x', creator: user('u1') } }).title).to.equal('営業');
        expect(toSearchHit({ type: 'THREAD', url: '', snippets: [], thread: { threadName: '雑談', spaceName: '営業', createdAt: 'x', creator: user('u1') } }))
            .to.include({ title: '雑談', location: '営業' });
    });

    it('知らない種類でも落ちず、url と snippets は残す', () => {
        const hit = toSearchHit({ type: 'NEW_TYPE', url: 'u', snippets: ['s'] });
        expect(hit).to.include({ type: 'NEW_TYPE', url: 'u', location: '', title: '' });
        expect(hit.snippets).to.deep.equal(['s']);
    });
});

describe('toSearchResult', () => {
    it('nextPageToken が無ければ null', () => {
        expect(toSearchResult({ hits: [] })).to.deep.equal({ hits: [], nextPageToken: null });
    });

    it('nextPageToken をそのまま返す', () => {
        expect(toSearchResult({ hits: [], nextPageToken: 'abc' }).nextPageToken).to.equal('abc');
    });

    it('hits が無いレスポンスは例外', () => {
        expect(() => toSearchResult({ message: 'x' })).to.throw('hits');
    });
});
