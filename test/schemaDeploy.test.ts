import { describe, it } from 'mocha';
import { expect } from 'chai';
import { formatDeployStatus } from '../src/utils/schemaWriter.js';

describe('formatDeployStatus', () => {
    it('PROCESSING → 反映処理中 を含む、[deployStatus: PROCESSING] を含む', () => {
        const result = formatDeployStatus([{ app: '463', status: 'PROCESSING' }]);
        expect(result).to.include('反映処理中');
        expect(result).to.include('[deployStatus: PROCESSING]');
        expect(result).to.include('463');
    });

    it('SUCCESS + no-diff → 差分なし（本番反映済み）を含む', () => {
        const result = formatDeployStatus([{ app: '463', status: 'SUCCESS', divergence: 'no-diff' }]);
        expect(result).to.include('preview と本番に差分なし');
        expect(result).to.include('本番反映済み');
        expect(result).to.include('[deployStatus: SUCCESS]');
    });

    it('SUCCESS + has-diff → 未反映の変更あり を含む', () => {
        const result = formatDeployStatus([{ app: '463', status: 'SUCCESS', divergence: 'has-diff' }]);
        expect(result).to.include('preview に未反映の変更あり');
        expect(result).to.include('[deployStatus: SUCCESS]');
        expect(result).not.to.include('前回デプロイ');
    });

    it('FAIL + has-diff → 差分あり + 前回デプロイ失敗 を含む', () => {
        const result = formatDeployStatus([{ app: '463', status: 'FAIL', divergence: 'has-diff' }]);
        expect(result).to.include('preview に未反映の変更あり');
        expect(result).to.include('前回デプロイ失敗');
        expect(result).to.include('[deployStatus: FAIL]');
    });

    it('FAIL + no-diff → 差分なし + 前回デプロイ失敗 を含む', () => {
        const result = formatDeployStatus([{ app: '463', status: 'FAIL', divergence: 'no-diff' }]);
        expect(result).to.include('preview と本番に差分なし');
        expect(result).to.include('前回デプロイ失敗');
        expect(result).to.include('[deployStatus: FAIL]');
    });

    it('CANCEL + fetch-failed → 差分確認に失敗 + 前回デプロイキャンセル を含む', () => {
        const result = formatDeployStatus([{ app: '463', status: 'CANCEL', divergence: 'fetch-failed' }]);
        expect(result).to.include('差分確認に失敗');
        expect(result).to.include('前回デプロイキャンセル');
        expect(result).to.include('[deployStatus: CANCEL]');
    });

    it('SUCCESS + fetch-failed → 差分確認に失敗 を含む、前回デプロイ注記なし', () => {
        const result = formatDeployStatus([{ app: '463', status: 'SUCCESS', divergence: 'fetch-failed' }]);
        expect(result).to.include('差分確認に失敗');
        expect(result).to.include('[deployStatus: SUCCESS]');
        expect(result).not.to.include('前回デプロイ');
    });

    it('未知の status で divergence なし → raw status のフォールバック', () => {
        const result = formatDeployStatus([{ app: '463', status: 'UNKNOWN_FUTURE_STATUS' }]);
        expect(result).to.include('UNKNOWN_FUTURE_STATUS');
    });

    it('複数エントリを改行区切りで返す', () => {
        const result = formatDeployStatus([
            { app: '463', status: 'SUCCESS', divergence: 'no-diff' },
            { app: '464', status: 'PROCESSING' },
        ]);
        const lines = result.split('\n');
        expect(lines).to.have.length(2);
        expect(lines[0]).to.include('463');
        expect(lines[1]).to.include('464');
    });

    it('空配列 → 空文字を返す', () => {
        const result = formatDeployStatus([]);
        expect(result).to.equal('');
    });
});
