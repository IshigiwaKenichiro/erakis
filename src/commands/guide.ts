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
npx erakis profile add
\`\`\`
4. アプリとの紐づけ
\`\`\`bash
npx erakis app connect
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
# 単一アプリ
npx erakis launch app
# 全アプリ一括
npx erakis launch all
\`\`\`
**注意**: デプロイはkintone本番環境に影響するため、実行前に必ずユーザーに確認すること。

### \`api\`
API生成ターゲットの管理を行う。
\`\`\`bash
# ターゲット追加
npx erakis api add
# ターゲット一覧
npx erakis api list
# ターゲット削除
npx erakis api remove <alias>
# 型定義ファイル生成
npx erakis api gen
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
# 追加
npx erakis profile add
# 一覧
npx erakis profile list
# 更新
npx erakis profile update <name>
# 削除
npx erakis profile remove <name>
\`\`\`

### \`open\`
kintoneアプリをブラウザで開く。
\`\`\`bash
npx erakis app open
\`\`\`

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
├── dist/             # ビルド成果物
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

または手動で \`${skillPath}\` に配置してください。`
}

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
| \`npx erakis profile add/list/update/remove\` | kintone接続プロファイル管理 |
| \`npx erakis app connect/status/codegen/open\` | kintoneアプリ管理 |
| \`npx erakis start\` | 開発サーバー起動 |
| \`npx erakis build\` | 本番ビルド |
| \`npx erakis launch app/all\` | kintoneへのデプロイ |
| \`npx erakis api add/list/remove/gen\` | API生成ターゲット管理 |
| \`npx erakis mcp\` | .mcp.json設定ファイル生成 |
| \`npx erakis ginue\` | .ginuerc.js設定ファイル生成 |
| \`npx erakis clear\` | dist/buildディレクトリ削除 |

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
`;

    console.log(guide);
}
