# Erakis v1.2.0
kintoneのシンプルなカスタマイズ開発環境です。
windows対象(2024年7月時点)

## Install
必要な作業は以下の２つです。
- 前提条件の準備
    - parcelのインストール
    - mkcertのインストール（任意）
- Erakisのインストール

### 前提条件
[parcel.v2](https://parceljs.org/)のインストール
```
npm i parcel
```

[mkcert](https://github.com/FiloSottile/mkcert)のインストール（なくても使えますが、devServerでのホスティングができません。）
```
# windows
choco install mkcert
```
---
### 本体のインストール
```
npm i erakis
```
---

## Usage
```
# セットアップ
npx erakis init

# 自己証明書と秘密鍵の生成
npx erakis genkey

# プロファイルの作成(一度作ると何度でもつかえます。)
npx erakis profile add

# アプリとの紐づけ
npx erakis app connect

# 開発の開始
npx erakis start

```


## Commands

### 開発コマンド

セットアップから開発・ビルド・デプロイまでの基本ワークフロー。

#### init
- npx erakis init
    - プロジェクトのセットアップ。安全な再生成。
#### genkey
- npx erakis genkey
    - HTTPSで利用する自己証明書を作成する。(localhostでソースを公開するため。)

#### profile
- npx erakis profile add
    - kintoneアクセスデータの登録
- npx erakis profile list
    - kintoneアクセスデータの一覧表示
- npx erakis profile update < profileName >
    - kintoneアクセスデータの更新
- npx erakis profile remove < profileName >
    - kintoneアクセスデータの削除

#### app
- npx erakis app connect
    - kintone上のアプリとカスタマイズの紐づけ。アプリ登録＋カスタマイズテンプレートファイルを生成する。
- npx erakis app register
    - アプリペアを `.erakis/apps.json` に登録する（カスタマイズファイルは生成しない）。`app connect` との違いはファイル生成なし。
- npx erakis app unregister
    - アプリをerakis管理から削除する（ローカルファイルは削除しない）。
- npx erakis app status
    - kintoneカスタマイズの状態表示
- npx erakis app codegen
    - ソースファイルの再生成
- npx erakis app open
    - アプリを開く

#### start
- npx erakis start
    - 開発を開始する。

#### build
- npx erakis build
    - ソースコードを本番向けにビルドする。

#### launch
- npx erakis launch app
    - kintoneアプリのカスタマイズ状態を変える（デフォルトはlocal）
- npx erakis launch all
    - 配下のkintoneアプリのカスタマイズ状態をまとめて変える

#### clear
- npx erakis clear
    - dist, buildディレクトリを削除する。

---

### schema コマンド

kintone アプリのスキーマ（フィールド・レイアウト・ビュー）を管理する。

> **重要**: 取得系コマンドはすべて kintone の preview（プレビュー）API を参照する。
> 本番環境の状態は `schema deploy` 実行後に preview と一致する。

#### {appRef} について

schema コマンドの `<appRef>` は以下の 2 形式を受け付ける。

| 形式 | 例 | 説明 |
|------|-----|------|
| `appName [-e env]` | `myApp` / `myApp -e prod` | .erakis/apps.json に登録されたアプリ名。デフォルトは dev |
| `appId[/guestSpaceId]` | `463` / `55/1` | 数値の appId。ゲストスペースは `/` で区切る |

#### アプリ作成
- npx erakis schema create \[spaceIdOrGuestSpaceId\]
    - 空の kintone アプリを作成する。引数省略時はスペースなし、数値ID指定時は通常スペースに作成。
    - `--guest-space` を付けるとゲストスペース用エンドポイントを使用する（スペースID＝ゲストスペースIDの場合）。
    - `--profile <name>` でプロファイル指定。`-y` で確認プロンプト省略。
    - 作成後は `.erakis/apps.json` への登録は行わない。`app register` / `app connect` で管理下に追加する。

#### スナップショット
- npx erakis schema pull
    - 全 customization アプリの dev/prod スナップショットを `kintone-app/snapshots/` に保存する
- npx erakis schema diff \<appName\>
    - dev と prod の差分を表示（fields + layout + views）
- npx erakis schema diff \<appId\> \<appId\>
    - 任意の 2 アプリ間の差分を表示
- npx erakis schema digest
    - フィールド要約を生成（md / tsv）。出力に `spaceId` と `isGuestSpace` のメタデータを含む。
- npx erakis schema docs
    - `docs/schema/README.md` を生成

#### デプロイ管理
- npx erakis schema deploy \<appRef\>
    - preview の変更を本番へデプロイ
- npx erakis schema undeploy \<appRef\>
    - preview の変更を破棄して本番状態に戻す（確認プロンプトあり）
- npx erakis schema get-deploy-status \<appRef\>
    - デプロイ状態を表示（PROCESSING / SUCCESS / FAIL / CANCEL）

#### レイアウト
- npx erakis schema get-layout \<appRef\> [filePath]
    - preview のレイアウトを取得。省略時は標準出力（`{ layout: [...] }` 形式）
- npx erakis schema update-layout \<appRef\> \<filePath\>
    - ファイルの JSON でレイアウトを全置換（確認プロンプトあり）
- npx erakis schema sync-layout \<appName\> --to \<dev|prod\>
    - 反対側 env のレイアウトを同期（--to prod は確認プロンプトあり）

#### ビュー
- npx erakis schema get-views \<appRef\> [filePath]
    - preview のビュー定義を取得。省略時は標準出力（`{ views: {...} }` 形式）
- npx erakis schema update-views \<appRef\> \<filePath\>
    - ファイルの JSON でビューを全置換（id は自動除去・確認プロンプトあり）
- npx erakis schema sync-views \<appName\> --to \<dev|prod\>
    - 反対側 env のビューを同期（id は自動除去・--to prod は確認プロンプトあり）

#### フィールド
- npx erakis schema get-field \<appRef\> [filePath]
    - preview のフィールド定義を取得。省略時は標準出力（`{ properties: {...} }` 形式）
- npx erakis schema create-field \<appRef\> \<filePath\>
    - ファイルの JSON でフィールドを追加（確認プロンプトあり）
- npx erakis schema update-field \<appRef\> \<filePath\>
    - ファイルの JSON でフィールドを更新（確認プロンプトあり）
- npx erakis schema delete-field \<appRef\> \<fieldCode...\>
    - フィールドを削除（確認プロンプトあり）
    - **⚠ deploy するとフィールドのデータごと完全に削除される**

---

### ツール連携コマンド

外部ツールとの連携や、AI支援のためのヘルパー。

#### api
- npx erakis api add
    - API生成ターゲットの追加
- npx erakis api list
    - API生成ターゲットの一覧表示
- npx erakis api remove < alias >
    - API生成ターゲットの削除
- npx erakis api gen
    - 型定義ファイルの生成

#### ginue
- npx erakis ginue
    - 設定情報をもとに`.ginuerc.js`ファイルを生成する

#### mcp
- npx erakis mcp
    - 設定情報をもとに、`kintone-mcp-server`の`.mcp.json`を生成する

#### guide
- npx erakis guide
    - AIエージェント向けのスキルセットアップガイドを表示する
- npx erakis guide --install
    - Skill.mdを `~/.claude/skills/erakis/` に自動インストールする


## license
MIT License.
