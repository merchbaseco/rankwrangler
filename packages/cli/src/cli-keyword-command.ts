import type { createRankWranglerClient } from '@rankwrangler/http-client';
import { type CliOptionValues, parseIntegerOption } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;
type CliClient = ReturnType<typeof createRankWranglerClient>;
const KEYWORD_MARKETPLACE_ID = 'ATVPDKIKX0DER' as const;

export const runKeywordCommand = async (
    command: { verb: string; args: string[] },
    client: CliClient,
    options: CliOptionValues,
    fail: CliFail
): Promise<unknown> => {
    if (options.refresh) {
        fail('INVALID_INPUT', '--refresh is not supported for keyword reads');
    }

    if (command.verb === 'get') {
        return await runKeywordGet(command.args, client, fail);
    }
    if (command.verb === 'search') {
        return await runKeywordSearch(command.args, client, options, fail);
    }
    if (command.verb === 'history') {
        return await runKeywordHistory(command.args, client, options, fail);
    }

    fail('UNKNOWN_COMMAND', 'Unknown Keyword command', {
        command: `keyword ${command.verb}`,
    });
};

const runKeywordGet = async (args: string[], client: CliClient, fail: CliFail) => {
    const keyword = requireKeyword(args, fail, 'keyword get');
    return await client.keyword.get.query({
        keyword,
        marketplaceId: KEYWORD_MARKETPLACE_ID,
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
        marketplaceId: KEYWORD_MARKETPLACE_ID,
        cursor: parseIntegerOption(
            {
                value: options.cursor,
                optionName: 'cursor',
                min: 0,
                max: 1_000_000,
                defaultValue: 0,
            },
            fail
        ),
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
        merchOnly: true,
    });
};

const runKeywordHistory = async (
    args: string[],
    client: CliClient,
    options: CliOptionValues,
    fail: CliFail
) => {
    const keyword = requireKeyword(args, fail, 'keyword history');
    return await client.keyword.history.query({
        keyword,
        marketplaceId: KEYWORD_MARKETPLACE_ID,
        rangeDays: parseIntegerOption(
            {
                value: options.rangeDays ?? options.days,
                optionName: 'rangeDays',
                min: 7,
                max: 365,
                defaultValue: 90,
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
