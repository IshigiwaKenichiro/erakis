import { describe, it } from 'mocha';
import { expect } from 'chai';
import { normalizeForCompare, formatLaunchSchemaWarning } from '../src/utils/schemaWriter.js';

describe('normalizeForCompare', () => {
    it('プリミティブ値はそのまま JSON 文字列化される', () => {
        expect(normalizeForCompare(42)).to.equal('42');
        expect(normalizeForCompare('hello')).to.equal('"hello"');
        expect(normalizeForCompare(null)).to.equal('null');
        expect(normalizeForCompare(true)).to.equal('true');
    });

    it('オブジェクトのキーはソートされる', () => {
        const a = normalizeForCompare({ z: 1, a: 2 });
        const b = normalizeForCompare({ a: 2, z: 1 });
        expect(a).to.equal(b);
    });

    it('ネストしたオブジェクトのキーもソートされる', () => {
        const a = normalizeForCompare({ field: { z: 1, a: 2 } });
        const b = normalizeForCompare({ field: { a: 2, z: 1 } });
        expect(a).to.equal(b);
    });

    it('配列の順序は保持される', () => {
        const a = normalizeForCompare([{ type: 'ROW' }, { type: 'GROUP' }]);
        const b = normalizeForCompare([{ type: 'GROUP' }, { type: 'ROW' }]);
        expect(a).not.to.equal(b);
    });

    it('キー順が違う同一内容のオブジェクトは等しくなる', () => {
        const obj1 = { b: 'x', a: [{ c: 3, d: 4 }] };
        const obj2 = { a: [{ d: 4, c: 3 }], b: 'x' };
        expect(normalizeForCompare(obj1)).to.equal(normalizeForCompare(obj2));
    });

    it('値が異なる場合は等しくならない', () => {
        expect(normalizeForCompare({ a: 1 })).not.to.equal(normalizeForCompare({ a: 2 }));
    });
});

describe('formatLaunchSchemaWarning', () => {
    it('差分なし + SUCCESS → null（警告不要）', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'no-diff');
        expect(result).to.be.null;
    });

    it('差分なし + deployStatus null → null（警告不要）', () => {
        const result = formatLaunchSchemaWarning('myApp', null, 'no-diff');
        expect(result).to.be.null;
    });

    it('PROCESSING → 反映処理中の警告を含む', () => {
        const result = formatLaunchSchemaWarning('myApp', 'PROCESSING', undefined);
        expect(result).not.to.be.null;
        expect(result![0].text).to.include('スキーマ反映処理中');
        expect(result![0].text).to.include('myApp');
    });

    it('has-diff → 未反映変更の警告と deploy 案内を含む', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'has-diff');
        expect(result).not.to.be.null;
        const texts = result!.map(w => w.text);
        expect(texts.some(t => t.includes('未反映のスキーマ変更'))).to.be.true;
        expect(texts.some(t => t.includes('erakis schema deploy myApp'))).to.be.true;
    });

    it('FAIL + has-diff → デプロイ失敗警告と差分警告の両方を含む', () => {
        const result = formatLaunchSchemaWarning('myApp', 'FAIL', 'has-diff');
        expect(result).not.to.be.null;
        const texts = result!.map(w => w.text);
        expect(texts.some(t => t.includes('失敗'))).to.be.true;
        expect(texts.some(t => t.includes('未反映のスキーマ変更'))).to.be.true;
    });

    it('CANCEL + no-diff → キャンセル警告のみ', () => {
        const result = formatLaunchSchemaWarning('myApp', 'CANCEL', 'no-diff');
        expect(result).not.to.be.null;
        expect(result![0].text).to.include('キャンセル');
        expect(result!.some(w => w.text.includes('未反映'))).to.be.false;
    });

    it('fetch-failed → スキーマ差分確認失敗の警告を含む', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'fetch-failed');
        expect(result).not.to.be.null;
        expect(result![0].text).to.include('スキーマ差分の確認に失敗');
    });

    it('FAIL + fetch-failed → デプロイ失敗 + 差分確認失敗の両方を含む', () => {
        const result = formatLaunchSchemaWarning('myApp', 'FAIL', 'fetch-failed');
        expect(result).not.to.be.null;
        const texts = result!.map(w => w.text);
        expect(texts.some(t => t.includes('デプロイが失敗'))).to.be.true;
        expect(texts.some(t => t.includes('スキーマ差分の確認に失敗'))).to.be.true;
    });

    it('appName が警告文に含まれる', () => {
        const result = formatLaunchSchemaWarning('targetApp', 'PROCESSING', undefined);
        expect(result![0].text).to.include('targetApp');
    });

    it('env を渡すと deploy 案内に -e <env> が含まれる', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'has-diff', 'dev');
        expect(result).not.to.be.null;
        const texts = result!.map(w => w.text);
        expect(texts.some(t => t.includes('-e dev'))).to.be.true;
    });

    it('env を省略すると deploy 案内に -e が含まれない', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'has-diff');
        expect(result).not.to.be.null;
        const texts = result!.map(w => w.text);
        const deployLine = texts.find(t => t.includes('erakis schema deploy'));
        expect(deployLine).to.exist;
        expect(deployLine).not.to.include('-e');
    });

    it('警告がある場合は末尾に「launch は継続します」の行が追加される', () => {
        const result = formatLaunchSchemaWarning('myApp', 'PROCESSING', undefined);
        expect(result).not.to.be.null;
        const last = result![result!.length - 1];
        expect(last.text).to.include('launch は継続します');
    });

    it('has-diff の警告にも「launch は継続します」が含まれる', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'has-diff');
        expect(result).not.to.be.null;
        const last = result![result!.length - 1];
        expect(last.text).to.include('launch は継続します');
    });

    it('fetch-failed の警告にも「launch は継続します」が含まれる', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'fetch-failed');
        expect(result).not.to.be.null;
        const last = result![result!.length - 1];
        expect(last.text).to.include('launch は継続します');
    });

    it('警告なし（null）のとき「launch は継続します」行は存在しない', () => {
        const result = formatLaunchSchemaWarning('myApp', 'SUCCESS', 'no-diff');
        expect(result).to.be.null;
    });
});
