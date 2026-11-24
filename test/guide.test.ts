import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { program, type Command } from 'commander';
import { registerCommands } from '../src/commands/registerCommands.js';
import {
    GUIDE_COMMAND_TABLE,
    SKILL_TEMPLATE,
    buildGuide,
    decideInstall,
    skillStateOf,
} from '../src/commands/guide.js';

/** サブコマンドを持たない末端のコマンドを「schema rename」のような空白区切りのパスで集める */
function leafCommandPaths(cmd: Command, prefix: string[] = []): string[] {
    const paths: string[] = [];
    for (const sub of cmd.commands) {
        const path = [...prefix, sub.name()];
        if (sub.commands.length === 0) {
            paths.push(path.join(' '));
            continue;
        }
        paths.push(...leafCommandPaths(sub, path));
    }
    return paths;
}

/** 「npx erakis schema create」が「npx erakis schema create-field」に当たらないよう、直後が空白か ` のものだけ数える */
function mentions(text: string, commandPath: string): boolean {
    return new RegExp(`npx erakis ${commandPath}[\\s\`\\\\]`).test(text);
}

/**
 * Skill 本文に載せなくてよいコマンド。
 * Skill は「引数ごとに何をするか」の手引きで、表のような網羅は求めない。ここに足すときは理由を書く。
 */
const SKILL_EXEMPT: Record<string, string> = {
    'clear': 'dist/build を消すだけで、AI が判断して使う場面が無い',
    'guide': 'Skill 自身をインストールするコマンド',
};

describe('guide の書き漏れ', () => {
    let paths: string[] = [];

    before(() => {
        registerCommands();
        paths = leafCommandPaths(program);
    });

    it('登録されたコマンドを集められる', () => {
        expect(paths).to.include.members(['search', 'schema rename', 'profile add', 'launch app']);
    });

    it('全コマンド一覧の表に、登録されたコマンドがすべて載っている', () => {
        const missing = paths.filter(p => !mentions(GUIDE_COMMAND_TABLE, p));
        expect(missing, `表に無いコマンド: ${missing.join(', ')}`).to.deep.equal([]);
    });

    it('Skill 本文に、登録されたコマンドがすべて載っている（SKILL_EXEMPT を除く）', () => {
        const missing = paths.filter(p => !(p in SKILL_EXEMPT) && !mentions(SKILL_TEMPLATE, p));
        expect(missing, `Skill 本文に無いコマンド: ${missing.join(', ')}`).to.deep.equal([]);
    });

    it('SKILL_EXEMPT に、もう無いコマンドが残っていない', () => {
        const stale = Object.keys(SKILL_EXEMPT).filter(p => !paths.includes(p));
        expect(stale).to.deep.equal([]);
    });
});

describe('Skill 本文と guide の安全でない記述', () => {
    const texts = { SKILL_TEMPLATE, guide: buildGuide('/home/u/.claude/skills/erakis/Skill.md', 'missing') };

    for (const [name, text] of Object.entries(texts)) {
        it(`${name}: パスワードを引数で渡す例が無い`, () => {
            expect(text).to.not.match(/--password\s+</);
            expect(text).to.not.match(/--basic-password\s+</);
        });

        it(`${name}: 古い設定キー allowedTools を案内していない`, () => {
            expect(text).to.not.include('allowedTools');
            expect(text).to.include('permissions');
        });
    }

    it('プロジェクト構造が実装の探す場所（src/app/<appName>/customize.desktop.ts）と合っている', () => {
        expect(SKILL_TEMPLATE).to.include('customize.desktop.ts');
        expect(SKILL_TEMPLATE).to.include('app/');
        expect(SKILL_TEMPLATE).to.not.match(/\s desktop\.ts/);
    });
});

describe('skillStateOf', () => {
    it('無ければ missing', () => {
        expect(skillStateOf(null)).to.equal('missing');
    });

    it('原本と同じなら same（改行コードの違いは無視する）', () => {
        expect(skillStateOf(SKILL_TEMPLATE)).to.equal('same');
        expect(skillStateOf(SKILL_TEMPLATE.replace(/\n/g, '\r\n'))).to.equal('same');
    });

    it('1文字でも違えば differs', () => {
        expect(skillStateOf(`${SKILL_TEMPLATE}\n# 自分で足した注意`)).to.equal('differs');
    });
});

describe('decideInstall', () => {
    it('無ければ書く', () => {
        expect(decideInstall('missing', false)).to.equal('write');
    });

    it('原本と同じなら何もしない（--force でも）', () => {
        expect(decideInstall('same', false)).to.equal('skip-same');
        expect(decideInstall('same', true)).to.equal('skip-same');
    });

    it('原本と違えば --force が無いと止まる', () => {
        expect(decideInstall('differs', false)).to.equal('refuse-differs');
    });

    it('原本と違って --force があれば退避してから書く', () => {
        expect(decideInstall('differs', true)).to.equal('backup-and-write');
    });
});

describe('buildGuide', () => {
    const skillPath = '/home/u/.claude/skills/erakis/Skill.md';

    it('未インストールなら --install を案内する', () => {
        expect(buildGuide(skillPath, 'missing')).to.include('npx erakis guide --install');
    });

    it('原本と違えば上書きしないことと --force を案内する', () => {
        const text = buildGuide(skillPath, 'differs');
        expect(text).to.include('上書きしません');
        expect(text).to.include('--install --force');
        expect(text).to.include('Skill.md.bak');
    });

    it('原本と同じなら再インストールを勧めない', () => {
        expect(buildGuide(skillPath, 'same')).to.not.include('npx erakis guide --install');
    });
});
