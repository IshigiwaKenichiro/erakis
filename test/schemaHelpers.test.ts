import { describe, it } from 'mocha';
import { expect } from 'chai';
import { parseRawAppRef, resolveProfileNameForAppId } from '../src/commands/schema/_helpers.js';

describe('parseRawAppRef', () => {
    it('数値のみ → appId を返す', () => {
        const r = parseRawAppRef('463');
        expect(r).to.deep.equal({ appId: '463', guestSpaceId: undefined });
    });

    it('appId/guestSpaceId → 両方を返す', () => {
        const r = parseRawAppRef('55/1');
        expect(r).to.deep.equal({ appId: '55', guestSpaceId: '1' });
    });

    it('文字列 → null（appName形式）', () => {
        expect(parseRawAppRef('phase3test')).to.equal(null);
    });

    it('空文字 → null', () => {
        expect(parseRawAppRef('')).to.equal(null);
    });

    it('数値/数値/数値（多段）→ null', () => {
        expect(parseRawAppRef('1/2/3')).to.equal(null);
    });

    it('数値混じり文字列 → null', () => {
        expect(parseRawAppRef('app123')).to.equal(null);
    });
});

describe('resolveProfileNameForAppId', () => {
    const customizations = {
        myApp: {
            development: { appId: '100', profileName: 'dev-profile' },
            production:  { appId: '200', profileName: 'prod-profile' },
        },
    };

    it('apps.json に一致する dev appId → dev-profile を返す', () => {
        const r = resolveProfileNameForAppId('100', customizations, ['dev-profile', 'prod-profile']);
        expect(r).to.deep.equal({ profileName: 'dev-profile' });
    });

    it('apps.json に一致する prod appId → prod-profile を返す', () => {
        const r = resolveProfileNameForAppId('200', customizations, ['dev-profile', 'prod-profile']);
        expect(r).to.deep.equal({ profileName: 'prod-profile' });
    });

    it('apps.json に不一致 + hint あり → hint を返す', () => {
        const r = resolveProfileNameForAppId('999', customizations, ['dev-profile', 'prod-profile'], 'hint-profile');
        expect(r).to.deep.equal({ profileName: 'hint-profile' });
    });

    it('apps.json に不一致 + hint なし + プロファイル1件 → そのプロファイルを返す', () => {
        const r = resolveProfileNameForAppId('999', customizations, ['only-profile']);
        expect(r).to.deep.equal({ profileName: 'only-profile' });
    });

    it('apps.json に不一致 + hint なし + 複数プロファイル → error を返す', () => {
        const r = resolveProfileNameForAppId('999', customizations, ['a', 'b']);
        expect(r).to.have.property('error');
        expect((r as any).error).to.include('999');
    });

    it('customizations が空 + hint あり → hint を返す', () => {
        const r = resolveProfileNameForAppId('463', {}, ['a', 'b'], 'mine');
        expect(r).to.deep.equal({ profileName: 'mine' });
    });
});
