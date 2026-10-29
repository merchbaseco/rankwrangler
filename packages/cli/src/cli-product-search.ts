import type { createRankWranglerClient } from '@rankwrangler/http-client';
import type { CliConfig } from './cli-config';
import { type CliOptionValues, requireMarketplaceId } from './cli-options';

type CliFail = (code: string, message: string, details?: unknown) => never;

export const runProductSearch = async (
    args: string[],
    client: ReturnType<typeof createRankWranglerClient>,
    config: CliConfig,
    options: CliOptionValues,
    fail: CliFail
): Promise<unknown> => {
    const term = args.join(' ').trim();
    const merch = choice(options.merch, ['true', 'false', 'unknown', 'all'], 'merch', fail);
    return await client.product.search.query({
        ...(term ? { term } : {}),
        marketplaceIds: [requireMarketplaceId(options, config)],
        textFields: choice(options.textFields, ['all', 'title'], 'textFields', fail),
        excludeWords: options.excludeWord,
        brands: options.brand,
        excludeBrands: options.excludeBrand,
        categoryIds: options.categoryId?.map(value => integer(value, 'categoryId', 1, fail)),
        facets: options.facet?.map(value => {
            const separator = value.indexOf('=');
            if (separator < 1 || separator === value.length - 1) {
                fail('INVALID_INPUT', '--facet must be facet=name');
            }
            return {
                facet: value.slice(0, separator),
                name: value.slice(separator + 1),
            };
        }),
        includeOfficialBrands: options.includeOfficialBrands,
        isMerchListing:
            merch === undefined
                ? undefined
                : merch === 'unknown' || merch === 'all'
                  ? merch
                  : merch === 'true',
        amazonListingStatus: choice(
            options.listingStatus,
            ['active', 'deleted', 'all'],
            'listingStatus',
            fail
        ),
        salesRank: range(options.minBsr, options.maxBsr, 'Bsr', fail),
        price: range(options.minPrice, options.maxPrice, 'Price', fail),
        monthlySold: range(options.minMonthlySold, options.maxMonthlySold, 'MonthlySold', fail),
        firstAvailableAt: dates(options.availableAfter, options.availableBefore, 'available', fail),
        updatedAt: dates(options.updatedAfter, options.updatedBefore, 'updated', fail),
        discoveredAt: dates(options.discoveredAfter, options.discoveredBefore, 'discovered', fail),
        sort: choice(
            options.sort,
            [
                'relevance',
                'salesRankAsc',
                'salesRankDesc',
                'firstAvailableAtDesc',
                'firstAvailableAtAsc',
                'updatedAtAsc',
                'updatedAtDesc',
                'discoveredAtDesc',
                'priceAsc',
                'priceDesc',
                'monthlySoldDesc',
            ],
            'sort',
            fail
        ),
        limit:
            options.limit === undefined ? undefined : integer(options.limit, 'limit', 1, fail, 100),
        cursor: options.cursor,
    });
};

const choice = <T extends string>(
    value: string | undefined,
    choices: readonly T[],
    name: string,
    fail: CliFail
): T | undefined => {
    if (value === undefined) return undefined;
    const match = choices.find(candidate => candidate === value);
    if (match === undefined) fail('INVALID_INPUT', `--${name} must be ${choices.join(', ')}`);
    return match;
};

const integer = (
    value: string,
    name: string,
    min: number,
    fail: CliFail,
    max = Number.MAX_SAFE_INTEGER
) => {
    const parsed = Number(value);
    if (!value.trim() || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        fail('INVALID_INPUT', `--${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
};

const range = (min: string | undefined, max: string | undefined, name: string, fail: CliFail) => {
    if (min === undefined && max === undefined) return undefined;
    const bounds = {
        ...(min === undefined ? {} : { min: integer(min, `min${name}`, 0, fail) }),
        ...(max === undefined ? {} : { max: integer(max, `max${name}`, 0, fail) }),
    };
    if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
        fail('INVALID_INPUT', `--min${name} must not exceed --max${name}`);
    }
    return bounds;
};

const dates = (
    after: string | undefined,
    before: string | undefined,
    name: string,
    fail: CliFail
) => {
    if (after === undefined && before === undefined) return undefined;
    const parse = (value: string) => {
        if (
            !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/.test(value) ||
            !Number.isFinite(new Date(value).getTime()) ||
            new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)
        ) {
            fail('INVALID_INPUT', `--${name}After and --${name}Before require ISO dates`);
        }
        return new Date(value).toISOString();
    };
    const bounds = {
        after: after === undefined ? undefined : parse(after),
        before: before === undefined ? undefined : parse(before),
    };
    if (bounds.after && bounds.before && bounds.after > bounds.before) {
        fail('INVALID_INPUT', `--${name}After must not exceed --${name}Before`);
    }
    return bounds;
};
