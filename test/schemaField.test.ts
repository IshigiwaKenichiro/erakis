import { describe, it } from 'mocha';
import { expect } from 'chai';
import { parseFieldsInput } from '../src/commands/schema/field.js';

describe('parseFieldsInput', () => {
    const sampleFields = {
        text_field: { type: 'SINGLE_LINE_TEXT', code: 'text_field', label: 'テキスト' },
    };

    it('{ properties: {...} } 形式 → properties オブジェクトを返す', () => {
        const r = parseFieldsInput({ properties: sampleFields });
        expect(r).to.deep.equal(sampleFields);
    });

    it('素のオブジェクト → そのまま返す', () => {
        const r = parseFieldsInput(sampleFields);
        expect(r).to.deep.equal(sampleFields);
    });

    it('get-field 出力をそのまま渡せる（ラウンドトリップ）', () => {
        const getFieldOutput = { properties: sampleFields };
        const r = parseFieldsInput(getFieldOutput);
        expect(r).to.deep.equal(sampleFields);
    });

    it('"properties" という名前のフィールドを含むラッパー形式 → ラッパーとして扱う', () => {
        // raw.properties がオブジェクトならラッパー優先という規則どおりの動作
        const fieldNamedProperties = { type: 'SINGLE_LINE_TEXT', code: 'properties', label: 'プロパティ' };
        const wrapper = { properties: { properties: fieldNamedProperties } };
        const r = parseFieldsInput(wrapper);
        expect(r).to.deep.equal({ properties: fieldNamedProperties });
    });

    it('空オブジェクト → そのまま返す', () => {
        const r = parseFieldsInput({});
        expect(r).to.deep.equal({});
    });

    it('null → error を返す', () => {
        const r = parseFieldsInput(null);
        expect(r).to.have.property('error');
    });

    it('配列 → error を返す', () => {
        const r = parseFieldsInput([]);
        expect(r).to.have.property('error');
    });

    it('文字列 → error を返す', () => {
        const r = parseFieldsInput('not a fields object');
        expect(r).to.have.property('error');
    });

    it('{ properties: "string" } → string はオブジェクトでないため素のマップとして扱う', () => {
        const r = parseFieldsInput({ properties: 'not-object' });
        expect(r).to.deep.equal({ properties: 'not-object' });
    });

    it('{ properties: [...] } → 配列はオブジェクトでないため素のマップとして扱う', () => {
        const r = parseFieldsInput({ properties: [] });
        expect(r).to.deep.equal({ properties: [] });
    });
});
