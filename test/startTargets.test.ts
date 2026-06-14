import { describe, it } from 'mocha';
import { expect } from 'chai';
import { checkStartTargets } from '../src/utils/_getTargets.js';

describe('checkStartTargets', () => {
    it('空配列 → canStart: false', () => {
        const r = checkStartTargets([]);
        expect(r.canStart).to.be.false;
    });

    it('html のみ → canStart: true, htmlOnly: true', () => {
        const r = checkStartTargets(['.erakis/index/index.html']);
        expect(r.canStart).to.be.true;
        if (r.canStart) {
            expect(r.htmlOnly).to.be.true;
            expect(r.customizationCount).to.equal(0);
        }
    });

    it('複数 html のみ → canStart: true, htmlOnly: true', () => {
        const r = checkStartTargets(['.erakis/index/index.html', 'src/test/index.html']);
        expect(r.canStart).to.be.true;
        if (r.canStart) {
            expect(r.htmlOnly).to.be.true;
            expect(r.customizationCount).to.equal(0);
        }
    });

    it('customization のみ → canStart: true, htmlOnly: false', () => {
        const r = checkStartTargets(['src/app/myApp/customize.desktop.ts']);
        expect(r.canStart).to.be.true;
        if (r.canStart) {
            expect(r.htmlOnly).to.be.false;
            expect(r.customizationCount).to.equal(1);
        }
    });

    it('customization + html 混在 → canStart: true, htmlOnly: false', () => {
        const r = checkStartTargets([
            'src/app/myApp/customize.desktop.ts',
            '.erakis/index/index.html',
        ]);
        expect(r.canStart).to.be.true;
        if (r.canStart) {
            expect(r.htmlOnly).to.be.false;
            expect(r.customizationCount).to.equal(1);
        }
    });

    it('複数 customization → customizationCount が正しい', () => {
        const r = checkStartTargets([
            'src/app/app1/customize.desktop.ts',
            'src/app/app2/customize.mobile.ts',
            'src/app/app3/customize.desktop.js',
            '.erakis/index/index.html',
        ]);
        expect(r.canStart).to.be.true;
        if (r.canStart) {
            expect(r.customizationCount).to.equal(3);
            expect(r.htmlOnly).to.be.false;
        }
    });
});
