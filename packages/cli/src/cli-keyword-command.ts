import type { PublicRouterInputs, createRankWranglerClient } from '@rankwrangler/http-client';
import { type CliOptionValues, parseIntegerOption } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;
type CliClient = ReturnType<typeof createRankWranglerClient>;

export const runKeywordCommand = async (
    command: { verb: string; args: string[] },
    client: CliClient,
    options: CliOptionValues,
    fail: CliFail
): Promise<unknown> => {
    if (command.verb !== 'results' && options.refresh) {
        fail('INVALID_INPUT', '--refresh is only supported for keyword results');
    }

    if (command.verb === 'results') {
        return await client.keyword.results.mutate({
            term: requireKeyword(command.args, fail, 'keyword results'),
            refresh: Boolean(options.refresh),
        });
    }
    if (command.verb === 'get') {
        return await runKeywordGet(command.args, client, fail);
    }
    if (command.verb === 'search') {
        return await runKeywordSearch(command.args, client, options, fail);
    }

    fail('UNKNOWN_COMMAND', 'Unknown Keyword command', {
        command: `keyword ${command.verb}`,
    });
};

const runKeywordGet = async (args: string[], client: CliClient, fail: CliFail) => {
    const keyword = requireKeyword(args, fail, 'keyword get');
    return await client.keyword.get.query({
        keyword,
    });
};

const runKeywordSearch = async (
    args: string[],
    client: CliClient,
    options: CliOptionValues,
    fail: CliFail
) => {
    const text = requireKeyword(args, fail, 'keyword search');
    return await client.keyword.search.query({
        text,
        stage: keywordChoice(options.stage, KEYWORD_STAGES, 'stage', fail),
        freshness: keywordChoice(options.freshness, KEYWORD_FRESHNESS, 'freshness', fail),
        cursor: options.cursor ? parseKeywordCursor(options.cursor, fail) : undefined,
        limit: parseIntegerOption(
            {
                value: options.limit,
                optionName: 'limit',
                min: 1,
                max: 100,
                defaultValue: 25,
            },
            fail
        ),
    });
};

const requireKeyword = (args: string[], fail: CliFail, commandName: string) => {
    const keyword = args.join(' ').trim();
    if (!keyword) {
        fail('INVALID_INPUT', `${commandName} requires text`);
    }
    return keyword;
};

type KeywordSearchInput = PublicRouterInputs['keyword']['search'];
const KEYWORD_STAGES = ['graduated', 'trial', 'dropped', 'untracked', 'all'] as const;
const KEYWORD_FRESHNESS = ['live', 'needsSync', 'syncing', 'all'] as const;
const keywordChoice = <T extends NonNullable<KeywordSearchInput['stage' | 'freshness']>>(
    value: string | undefined,
    choices: readonly T[],
    name: string,
    fail: CliFail
): T | undefined => {
    if (value === undefined) return undefined;
    const match = choices.find(candidate => candidate === value);
    return match ?? fail('INVALID_INPUT', `--${name} must be ${choices.join(', ')}`);
};

type KeywordCursor = NonNullable<PublicRouterInputs['keyword']['search']['cursor']>;
const parseKeywordCursor = (value: string, fail: CliFail): KeywordCursor => {
    try {
        const parsed = JSON.parse(value);
        const key = parsed?.key;
        if (!Array.isArray(key) || key.length !== 7 || !key.slice(0, 6).every(part => typeof part === 'number' && Number.isFinite(part))
            || typeof key[6] !== 'string' || typeof parsed.asOf !== 'string'
            || (parsed.sort !== 'work' && parsed.sort !== 'newest'))
            return fail('INVALID_INPUT', '--cursor must be the JSON nextCursor from keyword search');
        return { key: [key[0], key[1], key[2], key[3], key[4], key[5], key[6]], asOf: parsed.asOf, sort: parsed.sort };
    } catch { return fail('INVALID_INPUT', '--cursor must be valid JSON'); }
};
