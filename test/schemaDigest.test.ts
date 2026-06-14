import { describe, it } from 'mocha';
import { expect } from 'chai';
import { rawFileStem, buildHelpHint, classifyAppOption } from '../src/commands/schema/digest.js';

describe('rawFileStem', () => {
    it('通常 appId のみ → app-{id}', () => {
        expect(rawFileStem('123')).to.equal('app-123');
    });

    it('ゲストスペース込み → app-{id}-guest-{guestId}', () => {
        expect(rawFileStem('456', '999')).to.equal('app-456-guest-999');
    });

    it('guestSpaceId が空文字 → ゲストなし形式', () => {
        expect(rawFileStem('789', '')).to.equal('app-789');
    });

    it('guestSpaceId が undefined → ゲストなし形式', () => {
        expect(rawFileStem('1', undefined)).to.equal('app-1');
    });
});

describe('buildHelpHint', () => {
    it('登録済みアプリ名 → get-field にアプリ名が含まれる', () => {
        const hint = buildHelpHint('myApp');
        expect(hint).to.include('get-field myApp');
    });

    it('raw 通常: appId → get-field に数値 ID が含まれる（app- prefix なし）', () => {
        const hint = buildHelpHint('123');
        expect(hint).to.include('get-field 123');
        expect(hint).to.not.include('get-field app-123');
    });

    it('raw ゲスト: appId/guestSpaceId → get-field に 123/999 が含まれる', () => {
        const hint = buildHelpHint('123/999');
        expect(hint).to.include('get-field 123/999');
        expect(hint).to.not.include('get-field app-123');
    });

    it('ヒント文に CLAUDE.md 追記案内が含まれる', () => {
        const hint = buildHelpHint('any');
        expect(hint).to.include('CLAUDE.md');
        expect(hint).to.include('docs/schema/*.digest.md');
    });
});

describe('classifyAppOption', () => {
    const REGISTERED = ['myApp', 'salesApp', '123'];

    it('app が未指定 → all', () => {
        expect(classifyAppOption(undefined, REGISTERED)).to.deep.equal({ type: 'all' });
    });

    it('登録済みアプリ名 → registered（数値でも登録済み優先）', () => {
        expect(classifyAppOption('myApp', REGISTERED)).to.deep.equal({ type: 'registered' });
    });

    it('登録名が数値 123 でも registered を返す（raw より優先）', () => {
        expect(classifyAppOption('123', REGISTERED)).to.deep.equal({ type: 'registered' });
    });

    it('未登録の数値 appId → raw', () => {
        expect(classifyAppOption('456', REGISTERED)).to.deep.equal({ type: 'raw', appId: '456', guestSpaceId: undefined });
    });

    it('未登録の appId/guestSpaceId → raw with guestSpaceId', () => {
        expect(classifyAppOption('456/999', REGISTERED)).to.deep.equal({ type: 'raw', appId: '456', guestSpaceId: '999' });
    });

    it('未登録・非数値 → unknown', () => {
        expect(classifyAppOption('unknownApp', REGISTERED)).to.deep.equal({ type: 'unknown' });
    });
});
