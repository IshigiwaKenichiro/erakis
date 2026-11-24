import { program } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table';
import { profileStorage } from './_shared/helpers.js';
import { resolveProfileForCreate } from './schema/create.js';
import { buildSearchRequest, parseEndpoint, type SearchCliOptions } from '../search/request.js';
import { searchApi } from '../search/api.js';
import { SEARCH_TABLE_HEAD, toTableRow } from '../search/format.js';

type SearchCommandOptions = SearchCliOptions & {
    profile?: string;
    all?: boolean;
    json?: boolean;
};

/** 繰り返し指定できるオプションの値を配列に積む */
function collect(value: string, acc: string[]): string[] {
    acc.push(value);
    return acc;
}

export function searchCommand() {
    program
        .command('search [keywords...]')
        .description('search records, comments, spaces, threads and attachments across kintone (/k/v1/search.json).')
        .addHelpText('after', `
Keywords given as arguments form one AND condition.
Each --and / --or / --not adds one more condition; values are comma-separated.
Scope options without a value (e.g. --app) mean "all apps".
Those options take the next word as their value, so write keywords first
(erakis search 見積 --app), not after them (--app 見積 reads 見積 as an app ID).
Uses password auth of the profile (search.json does not accept API tokens).

Examples:
  erakis search 見積 承認
  erakis search --or 見積,請求 --not 下書き --type record,attachment
  erakis search 見積 --app 12,34 --exclude-space 5 --sort created --order asc
  erakis search 見積 --after 2026-05-01T00:00:00+09:00 --creator user1 --all --json`)
        .option('--and <keywords>', 'add an AND condition (comma-separated, repeatable)', collect, [] as string[])
        .option('--or <keywords>', 'add an OR condition (comma-separated, repeatable)', collect, [] as string[])
        .option('--not <keywords>', 'add a NOT condition (comma-separated, repeatable)', collect, [] as string[])
        .option('--type <types>', 'record, record_comment, space, thread, thread_comment, people_comment, message_comment, attachment (comma-separated)')
        .option('--app [ids]', 'search within apps (comma-separated IDs; no value = all apps)')
        .option('--space [ids]', 'search within spaces (comma-separated IDs; no value = all spaces)')
        .option('--people [codes]', 'search within people (comma-separated login names; no value = all)')
        .option('--message [codes]', 'search within messages (comma-separated login names; no value = all)')
        .option('--exclude-app [ids]', 'exclude apps (no value = all apps)')
        .option('--exclude-space [ids]', 'exclude spaces (no value = all spaces)')
        .option('--exclude-people [codes]', 'exclude people (no value = all)')
        .option('--exclude-message [codes]', 'exclude messages (no value = all)')
        .option('--creator <codes>', 'created by these users (comma-separated login names)')
        .option('--after <datetime>', 'created at or after (e.g. 2026-05-01T00:00:00+09:00)')
        .option('--before <datetime>', 'created at or before')
        .option('--synonyms', 'include synonyms, abbreviations and spelling variants')
        .option('--sort <by>', 'relevance or created (default: relevance)')
        .option('--order <order>', 'asc or desc (default: desc; asc requires --sort created)')
        .option('--limit <n>', 'max hits per page, 1-20 (default: 20)')
        .option('--page-token <token>', 'continue from nextPageToken of a previous search (valid for 30 minutes)')
        .option('--all', 'follow nextPageToken and fetch all pages (up to 50 pages)')
        .option('--guest-space [id]', 'search a guest space (no value = all guest spaces you joined)')
        .option('--profile <name>', 'kintone profile (required when there are multiple profiles)')
        .option('--json', 'print raw JSON instead of a table')
        .action(search);
}

async function search(keywords: string[], options: SearchCommandOptions) {
    const built = buildSearchRequest(keywords, options);
    const endpoint = parseEndpoint(options.guestSpace);
    const errors = [...(built.ok ? [] : built.errors), ...endpoint.errors];
    if (!built.ok || !endpoint.endpoint) {
        for (const e of errors) console.error(chalk.red(`error: ${e}`));
        process.exitCode = 1;
        return;
    }

    const { profiles } = profileStorage.getData();
    const profileResult = resolveProfileForCreate(Object.keys(profiles), options.profile);
    if ('error' in profileResult) {
        console.error(chalk.red(`error: ${profileResult.error}`));
        process.exitCode = 1;
        return;
    }
    const profile = profiles[profileResult.profileName];

    const result = options.all
        ? await searchApi.searchAll(profile, endpoint.endpoint, built.request)
        : await searchApi.search(profile, endpoint.endpoint, built.request);

    if (!result.success) {
        for (const e of result.errors) console.error(chalk.red(`error: [${e.code}] ${e.message}`));
        process.exitCode = 1;
        return;
    }

    const { hits, nextPageToken } = result.data;

    if (options.json) {
        console.log(JSON.stringify({ hits: hits.map(h => h.raw), nextPageToken }, null, 2));
        return;
    }

    if (hits.length === 0) {
        console.log(chalk.yellow('no hits.'));
    } else {
        const table = new Table({ head: SEARCH_TABLE_HEAD });
        for (const hit of hits) table.push(toTableRow(hit));
        console.log(table.toString());
    }

    console.log(chalk.cyan(`hits: ${hits.length}`));
    if (nextPageToken !== null) {
        console.log(chalk.gray(`more results: --page-token ${nextPageToken}  (or use --all)`));
    }
}
