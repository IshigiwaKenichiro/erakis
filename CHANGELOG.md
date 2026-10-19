# Changelog

このファイルは erakis の主な変更点を記録します。

書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従います。
日付は npm への公開日です。

## [2.0.0] - 未公開

### 追加

- スクリプトから認証情報を使う `erakis/profile` を追加。`getProfile(name)` がパスワード入りのプロファイルを返す（`password` / `basicPassword` は列挙されないので `console.log` や `JSON.stringify` では出ない）

### 変更

- **プロファイルのパスワードを OS の資格情報ストアに保存するようにした**（Windows の資格情報マネージャー / macOS のキーチェーン / Linux の Secret Service）
  - `~/.erakis/profiles.json` には baseUrl・username・basicUsername だけが残る
  - 1.x で平文保存されたパスワードは、2.0.0 で初めてプロファイルを使ったときに自動で資格情報ストアへ移り、ファイルからは消える。移せなかったときは平文を残して警告を出す
  - 資格情報ストアが使えない環境（CI など）では、環境変数 `ERAKIS_PASSWORD` / `ERAKIS_BASIC_PASSWORD` を使う。資格情報ストアが無くても、渡した値が環境変数と同じなら `profile add` はパスワード抜きで保存できる
- `profile list` はパスワードを伏せ字で表示する
- `profile add` / `update` のパスワード入力を伏せ字にした。`update` では空のまま Enter で今の値を残す。既存の値を画面に出さないようにした
- `init` / `ginue` / `mcp` を実行したとき、`.gitignore` に `.ginuerc.js` と `.mcp.json` が無ければ追記する（どちらもパスワードを平文で含むため）

### 互換性がなくなる変更

- 2.0.0 で移したあとは、同じマシンの 1.x の erakis からはパスワードが読めず認証に失敗する。1.x に固定しているプロジェクトがあれば 2.0.0 に揃える。1.x に戻す場合は `profile update` でパスワードを入れ直す

## [1.2.1] - 2026-06-30

### 修正

- `app connect` でファイルのコピー完了前にアサーションが走るバグを修正（`app codegen` / `init` のテンプレート展開も同様に修正）

## [1.2.0] - 2026-06-15

### 追加

- `schema` コマンド群を追加。kintone アプリのスキーマ（フィールド・レイアウト・ビュー）を管理する
  - `schema create` — 空のアプリを作成（通常スペース / ゲストスペース対応）
  - `schema pull` — preview API からスキーマを取得
  - `schema field` / `schema layout` / `schema views` — 各要素の操作
  - `schema docs` — スキーマからドキュメントを生成
- スキーマの差分表示を追加（`schemaDiff` / `layoutDiff` / `viewsDiff`）
- `appRef` として `appName [-e env]` と `appId[/guestSpaceId]` の2形式に対応

## [1.1.0] - 2026-03-04

### 追加

- `api` コマンドを追加。kintone アプリの型定義ファイルを生成する（`api add` / `list` / `remove` / `gen`）
- `guide` コマンドを追加。AIエージェント向けのスキルセットアップガイドを表示し、`--install` で `~/.claude/skills/erakis/` へインストールする

## [1.0.8] - 2025-09-03

### 追加

- `mcp` コマンドを追加。設定情報から `kintone-mcp-server` 用の `.mcp.json` を生成する

## [1.0.7] - 2025-07-30

### 変更

- ReadMe の修正内容を npm パッケージへ反映、その他の微修正

## [1.0.6] - 2025-07-30

### 追加

- `ginue` コマンドを追加。設定情報から `.ginuerc.js` を生成する

## [1.0.5] - 2024-08-08

### 変更

- 依存パッケージを整理

## [1.0.4] - 2024-08-08

### 修正

- ビルド時にキャッシュを利用しないよう修正

## [1.0.3] - 2024-07-23

### 追加

- LICENSE.txt を追加（MIT）

## [1.0.2] - 2024-07-23

npm への初回公開バージョン。

### 修正

- `package.json` に `main` があるとビルドエラーになる問題に対応（`init` 時に該当プロパティを除外）
- `launch` したアプリのステータスが変更されない不具合を修正
