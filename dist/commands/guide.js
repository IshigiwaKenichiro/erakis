import { program } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
/** Skill.md のテンプレート */
const SKILL_TEMPLATE = `---
name: erakis
description: >
  kintoneカスタマイズ開発環境erakisのCLIスキル。プロジェクト初期化・プロファイル管理・アプリ接続・開発サーバー起動・ビルド・デプロイ・MCP設定生成・ginue連携を提供する。
---

# Erakis スキル

kintoneカスタマイズ開発環境。CLIツール \`npx erakis\` を使用する。

## 引数による動作分岐

\`$ARGUMENTS\` の内容に応じて以下を実行する。

### 引数なし / \`status\`
アプリのカスタマイズ状態を表示する。
\`\`\`bash
npx erakis app status
\`\`\`

### \`setup\`
プロジェクトの初期セットアップを行う。以下を順に実行:
1. プロジェクト初期化
\`\`\`bash
npx erakis init
\`\`\`
2. HTTPS証明書の生成（mkcertが必要）
\`\`\`bash
npx erakis genkey
\`\`\`
3. プロファイル作成（kintone接続情報の登録）
\`\`\`bash
# インタラクティブ入力
npx erakis profile add
# オプション指定でプロンプトをスキップ（基本認証は --basic-username / --basic-password も追加可）
npx erakis profile add -n <name> --base-url <url> --username <user> --password <pass>
\`\`\`
4. アプリとの紐づけ

カスタマイズファイルも一緒に生成する場合:
\`\`\`bash
npx erakis app connect
# オプション指定で非インタラクティブ実行
npx erakis app connect -n <name> --dev-profile <profile> --prod-profile <profile> --dev-url <url> --prod-url <url> -y
\`\`\`

スキーマ参照・差分確認のみ（カスタマイズファイルは不要）の場合:
\`\`\`bash
npx erakis app register
npx erakis app register -n <name> --dev-profile <profile> --prod-profile <profile> --dev-url <url> --prod-url <url> -y
\`\`\`
\`app register\` は \`.erakis/apps.json\` にアプリ情報を登録するだけで、カスタマイズソースファイルやテンプレートは生成しない。
\`app connect\` はアプリ登録に加えてカスタマイズ用テンプレートファイルも自動生成する。
管理から外す場合は \`app unregister\` を使う（ローカルファイルは削除されない）。
\`\`\`bash
npx erakis app unregister --app <name> -y
\`\`\`

### \`dev\`
開発サーバーを起動する。ファイル変更を監視し、kintone上でリアルタイムに反映される。
\`\`\`bash
npx erakis start
\`\`\`

### \`build\`
ソースコードを本番向けにビルドする。
\`\`\`bash
npx erakis build
\`\`\`

### \`deploy\`
kintoneアプリのカスタマイズ状態を変更する。
\`\`\`bash
# 単一アプリ（インタラクティブ選択）
npx erakis launch app
# オプション指定で非インタラクティブ実行
npx erakis launch app --app <name> --env <dev|prod> --status <local|fixed|released>

# 全アプリ一括
npx erakis launch all
npx erakis launch all --env <dev|prod> --status <local|fixed|released> --yes
\`\`\`
status の意味: \`local\` = devサーバー参照 / \`fixed\` = dist/（開発ビルド）をデプロイ / \`released\` = build/（本番ビルド）をデプロイ

**注意**: デプロイはkintone本番環境に影響するため、実行前に必ずユーザーに確認すること。

### \`api\`
kintoneアプリの型定義ファイルを生成・管理する。
\`\`\`bash
# ターゲット登録 + 型定義ファイル生成（--app は繰り返し可）
npx erakis api gen --app <appId:alias> --profile <name>
npx erakis api gen --app 1:master --app 2:sub --profile dev

# 登録済み全ターゲットを再生成（--app 省略時）
npx erakis api gen

# その他のオプション
# --out <dir>      出力ディレクトリ
# --dry-run        生成内容を確認（ファイル書き込みなし）
# --clean          今回生成対象外の @generated ファイルを削除
# --no-prettier    prettier フォーマットをスキップ
# --verbose        詳細ログ

# ターゲット削除
npx erakis api remove --alias <name>
\`\`\`

### \`mcp\`
kintone-mcp-server用の \`.mcp.json\` 設定ファイルを自動生成する。
\`\`\`bash
npx erakis mcp
\`\`\`

### \`ginue\`
ginue用の \`.ginuerc.js\` 設定ファイルを自動生成する。
\`\`\`bash
npx erakis ginue
\`\`\`

### \`profile\`
kintone接続プロファイルを管理する。
\`\`\`bash
# 追加（オプション省略時はインタラクティブ入力）
npx erakis profile add
npx erakis profile add -n <name> --base-url <url> --username <user> --password <pass>
npx erakis profile add -n <name> --base-url <url> --username <user> --password <pass> --basic-username <bu> --basic-password <bp>

# 一覧
npx erakis profile list

# 更新（オプション省略時はインタラクティブ入力、指定した項目だけ上書き）
npx erakis profile update <name>
npx erakis profile update <name> --base-url <url> --username <user> --password <pass>

# 削除
npx erakis profile remove <name>
\`\`\`

### \`open\`
kintoneアプリをブラウザで開く。
\`\`\`bash
npx erakis app open
npx erakis app open --app <name>
\`\`\`

### \`schema\`
kintoneアプリのフィールド・レイアウト・ビューをローカルファイル化し、AIと人間が低コストで参照できるようにする。

**共通オプション**（多くのサブコマンドで使用可）:
- \`-e, --env <dev|prod>\` — 対象環境（デフォルト: dev）
- \`--profile <name>\` — 接続プロファイル（生 appId 使用時に必要）
- \`-y, --yes\` — 確認プロンプトをスキップ

\`<appRef>\` は \`appName [-e dev|prod]\` または \`appId[/guestSpaceId]\`（数値）の2形式。

#### 空アプリの作成
\`\`\`bash
npx erakis schema create                        # スペースなしで空アプリを作成
npx erakis schema create 123                    # 通常スペース 123 に作成
npx erakis schema create 123 --guest-space      # ゲストスペース 123 に作成（/k/guest/... エンドポイント使用）
npx erakis schema create --profile <name> -y
\`\`\`
作成後は \`app register\` または \`app connect\` で管理下に追加する。

#### スキーマ取得（スナップショット）
\`\`\`bash
npx erakis schema pull              # 全アプリを取得
npx erakis schema pull --app myapp  # 特定アプリのみ
npx erakis schema pull --no-latest  # latest.json の更新をスキップ
\`\`\`

#### ダイジェスト生成（AIのフィールド調査用要約ビュー）
\`\`\`bash
npx erakis schema digest                                    # 全アプリのdigest生成
npx erakis schema digest --app myapp                       # 特定アプリのみ
npx erakis schema digest --format tsv                      # TSV形式で出力（デフォルト: md）
npx erakis schema digest --env prod --profile <name>
\`\`\`
digest 出力には \`spaceId\` と \`isGuestSpace\` のメタデータが含まれる（ゲストスペースアプリの識別に使用）。

#### スキーマ差分確認
\`\`\`bash
npx erakis schema diff myapp            # dev vs prod の差分
npx erakis schema diff myapp --full     # unified diff も表示
npx erakis schema diff 123 456          # 任意の2アプリ間（--profile 必要）
npx erakis schema diff 123 456 --profile <name>
\`\`\`
出力行頭の記号: \`+\` 追加 / \`~\` 変更 / \`-\` 削除 / \`!\` 型変更（⚠ データ消失を伴う）

#### フィールド定義の取得・書き込み
\`\`\`bash
# 取得
npx erakis schema get-field myapp              # stdout に JSON 出力
npx erakis schema get-field myapp fields.json  # ファイルに保存
npx erakis schema get-field myapp -e prod --profile <name>

# 追加（JSON ファイルから preview に積む）
npx erakis schema create-field myapp fields.json
npx erakis schema create-field myapp fields.json -e prod --profile <name> -y

# 更新（型変更不可。型変更は delete → create の2段が必要）
npx erakis schema update-field myapp fields.json
npx erakis schema update-field myapp fields.json -e prod --profile <name> -y

# 削除（⚠ deploy するとデータごと消える）
npx erakis schema delete-field myapp fieldCode1 fieldCode2
npx erakis schema delete-field myapp fieldCode1 -e prod --profile <name> -y
\`\`\`

#### レイアウトの操作
\`\`\`bash
# 取得
npx erakis schema get-layout myapp
npx erakis schema get-layout myapp layout.json  # ファイルに保存
npx erakis schema get-layout myapp -e prod --profile <name>

# 更新（全置換。kintone API の制約）
npx erakis schema update-layout myapp layout.json
npx erakis schema update-layout myapp layout.json -e prod --profile <name> -y

# 同期（appName のみ、rawAppId 不可）
npx erakis schema sync-layout myapp --to prod     # dev → prod（確認あり）
npx erakis schema sync-layout myapp --to dev -y   # prod → dev（確認スキップ）
npx erakis schema sync-layout myapp --to prod --profile <name>
\`\`\`

#### ビューの操作
\`\`\`bash
# 取得
npx erakis schema get-views myapp
npx erakis schema get-views myapp views.json  # ファイルに保存
npx erakis schema get-views myapp -e prod --profile <name>

# 更新（id は自動除去）
npx erakis schema update-views myapp views.json
npx erakis schema update-views myapp views.json -e prod --profile <name> -y

# 同期
npx erakis schema sync-views myapp --to prod -y
npx erakis schema sync-views myapp --to dev --profile <name>
\`\`\`

#### デプロイ管理
\`\`\`bash
# preview → live に反映
npx erakis schema deploy myapp
npx erakis schema deploy myapp -e prod --profile <name>

# preview の変更を破棄（live の状態に戻す。確認あり）
npx erakis schema undeploy myapp -y
npx erakis schema undeploy myapp -e prod --profile <name> -y

# デプロイ状態確認（PROCESSING / SUCCESS / FAIL / CANCEL）
npx erakis schema get-deploy-status myapp
npx erakis schema get-deploy-status myapp -e prod --profile <name>
\`\`\`

#### プロジェクト管理ドキュメント生成
\`\`\`bash
npx erakis schema docs          # docs/schema/README.md を生成（dev）
npx erakis schema docs -e prod  # prod 環境から生成
\`\`\`
管理アプリ一覧・mermaid 関連図・型別件数・Views サマリを含む。

#### AIがフィールド構成を調べる際の規律（重要）
1. **まず Grep**: \`docs/schema/*.digest.md\` を Grep/Read する（1フィールド1行、全情報が同一行）
2. **詳細は get-field コマンド**: 選択肢全件・lookup詳細・式全文が必要なら \`npx erakis schema get-field <appName> [filePath]\`
3. **生JSONは原則読まない**: \`.erakis/schema/<app>/fields.json\` / \`src/app/*/formFields.json\` は大きいので Read しない

digest がない場合は \`npx erakis schema digest\` で生成すること。
スキーマが変わったら再度 \`npx erakis schema digest\` で更新すること。

## 開発ワークフロー

標準的な開発フローは以下の通り:

1. **初期セットアップ**: \`/erakis setup\`
2. **開発**: \`/erakis dev\` でサーバー起動 → src/ 内のファイルを編集
3. **ビルド**: \`/erakis build\` で本番ビルド
4. **デプロイ**: \`/erakis deploy\` でkintoneに反映

## プロジェクト構造

\`\`\`
project/
├── .erakis/          # erakis設定（apps.json等）
├── src/              # カスタマイズソースコード
│   └── <appName>/    # アプリごとのディレクトリ
│       ├── desktop.ts    # PC用カスタマイズ
│       └── mobile.ts     # モバイル用カスタマイズ
├── dist/             # 開発ビルド成果物
├── build/            # 本番ビルド出力
└── package.json
\`\`\`

## 権限設定（推奨）

\`~/.claude/settings.json\` の \`allowedTools\` に以下を追加:
\`\`\`json
"Bash(npx erakis *)"
\`\`\`
`;
/**
 * guideコマンド: スキルのセットアップガイドを出力する
 */
export function guideCommand() {
    program
        .command('guide')
        .description('AIエージェント向けのスキルセットアップガイドを表示する')
        .option('--install', 'Skill.mdを ~/.claude/skills/erakis/ に自動インストールする')
        .action((opts) => {
        if (opts.install) {
            installSkill();
            return;
        }
        printGuide();
    });
}
function installSkill() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) {
        console.error(JSON.stringify({ error: 'HOME/USERPROFILE が見つかりません' }));
        process.exit(2);
    }
    const skillDir = path.join(home, '.claude', 'skills', 'erakis');
    const skillPath = path.join(skillDir, 'Skill.md');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, SKILL_TEMPLATE, 'utf-8');
    console.log(JSON.stringify({
        installed: true,
        path: skillPath,
        next: '~/.claude/settings.json の allowedTools に "Bash(npx erakis *)" を追加してください',
    }));
}
function printGuide() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skillDir = path.join(home, '.claude', 'skills', 'erakis');
    const skillPath = path.join(skillDir, 'Skill.md');
    const skillExists = fs.existsSync(skillPath);
    const guide = `# Erakis セットアップガイド（AIエージェント向け）

${skillExists
        ? `> ℹ️  Skill.md がインストール済みです。schema コマンドが追加された場合は \`npx erakis guide --install\` で再インストールを推奨します。`
        : ''}

## 前提パッケージ

- **Node.js** / **npm**
- **parcel** (v2): \`npm i parcel\`
- **mkcert** (任意・devServer用): \`choco install mkcert\`

## 1. スキルのインストール

${skillExists
        ? `✓ Skill.md は既にインストール済みです: ${skillPath}`
        : `Skill.md が未インストールです。以下のコマンドで自動インストールできます:

\`\`\`bash
npx erakis guide --install
\`\`\`

または手動で \`${skillPath}\` に配置してください。`}

## 2. 権限設定（推奨）

\`~/.claude/settings.json\` の \`allowedTools\` に以下を追加すると、毎回の承認が不要になります:

\`\`\`json
"Bash(npx erakis *)"
\`\`\`

## 3. 全コマンド一覧

| コマンド | 説明 |
|---------|------|
| \`npx erakis init\` | プロジェクトのセットアップ |
| \`npx erakis genkey\` | HTTPS自己証明書の生成 |
| \`npx erakis profile add [-n] [--base-url] [--username] [--password] [--basic-username] [--basic-password]\` | プロファイル追加 |
| \`npx erakis profile list\` | プロファイル一覧 |
| \`npx erakis profile update <name> [--base-url] [--username] [--password] [--basic-username] [--basic-password]\` | プロファイル更新 |
| \`npx erakis profile remove <name>\` | プロファイル削除 |
| \`npx erakis app connect [-n] [--dev-profile] [--prod-profile] [--dev-url] [--prod-url] [-y]\` | アプリ登録＋カスタマイズテンプレート生成 |
| \`npx erakis app register [-n] [--dev-profile] [--prod-profile] [--dev-url] [--prod-url] [-y]\` | アプリをerakis管理下に登録（カスタマイズファイルなし） |
| \`npx erakis app unregister [-a] [-y]\` | アプリをerakis管理から削除（ローカルファイルは削除しない） |
| \`npx erakis app status\` | アプリ状態確認 |
| \`npx erakis app codegen [-a]\` | コード再生成 |
| \`npx erakis app open [-a]\` | アプリをブラウザで開く |
| \`npx erakis start\` | 開発サーバー起動 |
| \`npx erakis build\` | 本番ビルド |
| \`npx erakis launch app [-a] [-e dev\|prod] [-s local\|fixed\|released]\` | 単一アプリのデプロイ |
| \`npx erakis launch all [-e dev\|prod] [-s local\|fixed\|released] [-y]\` | 全アプリ一括デプロイ |
| \`npx erakis api gen [--app <appId:alias>] [--profile] [--out] [--dry-run] [--clean] [--no-prettier] [--verbose]\` | API型定義生成 |
| \`npx erakis api remove --alias <name>\` | APIターゲット削除 |
| \`npx erakis mcp\` | .mcp.json設定ファイル生成 |
| \`npx erakis ginue\` | .ginuerc.js設定ファイル生成 |
| \`npx erakis clear\` | dist/buildディレクトリ削除 |
| \`npx erakis schema create [spaceId] [--guest-space] [--profile] [-y]\` | 空の kintone アプリを作成 |
| \`npx erakis schema pull [-a] [--no-latest]\` | kintoneスキーマをローカルに保存 |
| \`npx erakis schema diff [a] [b] [--full] [--profile]\` | dev vs prod / 任意2アプリ間のスキーマ差分表示 |
| \`npx erakis schema digest [-a] [-f md\|tsv] [-e] [--profile]\` | フィールドダイジェスト生成 |
| \`npx erakis schema get-field <appRef> [filePath] [-e] [--profile]\` | フィールド定義を JSON で取得 |
| \`npx erakis schema create-field <appRef> <filePath> [-e] [--profile] [-y]\` | フィールド追加（preview に積む） |
| \`npx erakis schema update-field <appRef> <filePath> [-e] [--profile] [-y]\` | フィールド更新（preview に積む） |
| \`npx erakis schema delete-field <appRef> <fieldCodes...> [-e] [--profile] [-y]\` | フィールド削除（preview に積む） |
| \`npx erakis schema deploy <appRef> [-e] [--profile]\` | preview → live に反映 |
| \`npx erakis schema undeploy <appRef> [-e] [--profile] [-y]\` | preview の変更を破棄 |
| \`npx erakis schema get-deploy-status <appRef> [-e] [--profile]\` | デプロイ状態確認 |
| \`npx erakis schema get-layout <appRef> [filePath] [-e] [--profile]\` | layout 取得 |
| \`npx erakis schema update-layout <appRef> <filePath> [-e] [--profile] [-y]\` | layout 更新（全置換） |
| \`npx erakis schema sync-layout <appName> --to <dev\|prod> [-y] [--profile]\` | layout を環境間同期 |
| \`npx erakis schema get-views <appRef> [filePath] [-e] [--profile]\` | views 取得 |
| \`npx erakis schema update-views <appRef> <filePath> [-e] [--profile] [-y]\` | views 更新 |
| \`npx erakis schema sync-views <appName> --to <dev\|prod> [-y] [--profile]\` | views を環境間同期 |
| \`npx erakis schema docs [-e]\` | docs/schema/README.md 生成 |
| \`npx erakis guide [--install]\` | AIエージェント向けスキルガイド表示・インストール |

## 4. 開発ワークフロー

\`\`\`
init → genkey → profile add → app connect → start → build → launch
\`\`\`

## 5. スキル呼び出し（Claude Code）

インストール後は以下のスキルが使えます:

- \`/erakis\` または \`/erakis status\` — アプリ状態確認
- \`/erakis setup\` — 初期セットアップ
- \`/erakis dev\` — 開発サーバー起動
- \`/erakis build\` — 本番ビルド
- \`/erakis deploy\` — kintoneへデプロイ
- \`/erakis api\` — API生成ターゲット管理
- \`/erakis mcp\` — MCP設定生成
- \`/erakis ginue\` — ginue設定生成
- \`/erakis profile\` — プロファイル管理
- \`/erakis open\` — アプリを開く
- \`/erakis schema\` — スキーマ取得・差分確認・docs生成
`;
    console.log(guide);
}
