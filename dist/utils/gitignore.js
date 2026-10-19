import fs from 'fs-extra';
// 認証情報を含みうる生成物。古い erakis で作ったものは平文のパスワードが入っている
export const SECRET_FILES = ['.ginuerc.js', '.mcp.json'];
/** 足りない行だけ追記する。既存の並びやコメントは崩さない */
export function ensureGitignore(file, entries = SECRET_FILES) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines = new Set(current.split(/\r?\n/).map(line => line.trim()));
    const missing = entries.filter(entry => !lines.has(entry) && !lines.has(`/${entry}`));
    if (missing.length === 0)
        return missing;
    const separator = current === '' || current.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(file, `${separator}${missing.join('\n')}\n`);
    console.log(`.gitignore: added ${missing.join(', ')}`);
    return missing;
}
