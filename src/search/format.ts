import type { SearchHit } from '../models.js';

/** 表のセルに入れるスニペットの長さ。長いと端末の幅を超えて表が崩れる */
export const SNIPPET_CELL_LENGTH = 40;

export const SEARCH_TABLE_HEAD = ['type', 'location', 'title', 'creator', 'created', 'snippet', 'url'];

/** 改行をつぶし、max 文字を超えたら末尾を … にする */
export function truncate(text: string, max: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    return `${flat.slice(0, max - 1)}…`;
}

/** 作成日時を表で読みやすい形（日付部分だけ）にする。null は空欄 */
export function formatCreatedAt(createdAt: string | null): string {
    if (createdAt === null) return '';
    return createdAt.slice(0, 'YYYY-MM-DD'.length);
}

/** SearchHit を表の1行にする */
export function toTableRow(hit: SearchHit): string[] {
    return [
        hit.type,
        hit.location,
        hit.title,
        hit.creator?.name ?? '',
        formatCreatedAt(hit.createdAt),
        truncate(hit.snippets[0] ?? '', SNIPPET_CELL_LENGTH),
        hit.url,
    ];
}
