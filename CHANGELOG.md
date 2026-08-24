# Changelog

このファイルは erakis の主な変更点を記録します。

書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従います。
日付は npm への公開日です。

## [1.2.1] - 2026-06-30

### Fixed

- `app connect` でファイルのコピー完了前にアサーションが走るバグを修正（`app codegen` / `init` のテンプレート展開も同様に修正）

## [1.2.0] - 2026-06-15

### Added

- `schema` コマンド群を追加。kintone アプリのスキーマ（フィールド・レイアウト・ビュー）を管理する
  - `schema create` — 空のアプリを作成（通常スペース / ゲストスペース対応）
  - `schema pull` — preview API からスキーマを取得
  - `schema field` / `schema layout` / `schema views` — 各要素の操作
  - `schema docs` — スキーマからドキュメントを生成
- スキーマの差分表示を追加（`schemaDiff` / `layoutDiff` / `viewsDiff`）
- `appRef` として `appName [-e env]` と `appId[/guestSpaceId]` の2形式に対応

## [1.1.0] - 2026-03-04

### Added

- `api` コマンドを追加。kintone アプリの型定義ファイルを生成する（`api add` / `list` / `remove` / `gen`）
- `guide` コマンドを追加。AIエージェント向けのスキルセットアップガイドを表示し、`--install` で `~/.claude/skills/erakis/` へインストールする

## [1.0.8] - 2025-09-03

### Added

- `mcp` コマンドを追加。設定情報から `kintone-mcp-server` 用の `.mcp.json` を生成する

## [1.0.7] - 2025-07-30

### Changed

- ReadMe の修正内容を npm パッケージへ反映、その他の微修正

## [1.0.6] - 2025-07-30

### Added

- `ginue` コマンドを追加。設定情報から `.ginuerc.js` を生成する

## [1.0.5] - 2024-08-08

### Changed

- 依存パッケージを整理

## [1.0.4] - 2024-08-08

### Fixed

- ビルド時にキャッシュを利用しないよう修正

## [1.0.3] - 2024-07-23

### Added

- LICENSE.txt を追加（MIT）

## [1.0.2] - 2024-07-23

npm への初回公開バージョン。

### Fixed

- `package.json` に `main` があるとビルドエラーになる問題に対応（`init` 時に該当プロパティを除外）
- `launch` したアプリのステータスが変更されない不具合を修正
