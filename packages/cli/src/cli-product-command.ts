import type { createRankWranglerClient } from '@rankwrangler/http-client';
import type { CliConfig } from './cli-config';
import {
    type CliOptionValues,
    parseIntegerOption,
    requireAsins,
    requireMarketplaceId,
    requireSingleAsin,
    resolveHistoryBucket,
    resolveHistoryMetrics,
    resolveHistoryWindow,
} from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;
type CliClient = ReturnType<typeof createRankWranglerClient>;

export const runProductCommand = async (
    command: { verb: string; args: string[] },
    client: CliClient,
    config: CliConfig,
    options: CliOptionValues,
    fail: CliFail
): Promise<unknown> => {
    if (command.verb !== 'search' && options.refresh) {
        fail('INVALID_INPUT', '--refresh is only supported for product search');
    }

    if (command.verb === 'get') {
        return await runProductGet(command.args, client, config, options, fail);
    }
    if (command.verb === 'search') {
        return await runProductSearch(command.args, client, options, fail);
    }
    if (command.verb === 'history') {
        return await runProductHistory(command.args, client, config, options, fail);
    }

    fail('UNKNOWN_COMMAND', 'Unknown Product command', {
        command: `product ${command.verb}`,
    });
};

const runProductGet = async (
    args: string[],
    client: CliClient,
    config: CliConfig,
    options: CliOptionValues,
    fail: CliFail
) => {
    const marketplaceId = requireMarketplaceId(options, config);
    const asins = requireAsins(args, fail);

    if (asins.length === 1) {
        return await client.product.get.mutate({
            marketplaceId,
            asin: asins[0],
        });
    }

    return await client.product.getMany.mutate({
        products: asins.map(asin => ({ marketplaceId, asin })),
    });
};

const runProductSearch = async (
    args: string[],
    client: CliClient,
    options: CliOptionValues,
    fail: CliFail
) => {
    const term = args.join(' ').trim();
    if (!term) {
        fail('INVALID_INPUT', 'product search requires a keyword');
    }

    return await client.product.search.mutate({
        term,
        refresh: Boolean(options.refresh),
    });
};

const runProductHistory = async (
    args: string[],
    client: CliClient,
    config: CliConfig,
    options: CliOptionValues,
    fail: CliFail
) => {
    const asin = requireSingleAsin(args, fail, 'product history');
    const historyOptions = resolveHistoryOptions(options, fail);
    return await client.product.history.mutate({
        marketplaceId: requireMarketplaceId(options, config),
        asin,
        ...historyOptions,
    });
};

const resolveHistoryOptions = (options: CliOptionValues, fail: CliFail) => ({
    metrics: resolveHistoryMetrics(options, fail),
    bucket: resolveHistoryBucket(options, fail),
    limit: parseIntegerOption(
        {
            value: options.limit,
            optionName: 'limit',
            min: 1,
            max: 10_000,
            defaultValue: 5000,
        },
        fail
    ),
    ...resolveHistoryWindow(options, fail),
});
