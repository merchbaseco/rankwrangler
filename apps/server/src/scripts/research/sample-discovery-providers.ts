import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
    createKeywordAutocompleteUrl,
    parseAutocompleteSuggestions,
} from '../../services/keyword-autocomplete-provider';
import { mapSpApiCatalogItem } from '../../services/spapi/catalog-product-mapper';
import { ItemSearchResultsSchema } from '../../services/spapi/search-catalog-items-schema';

const inputSchema = z.object({
    products: z
        .array(
            z.object({
                asin: z.string(),
                band: z.string(),
                title: z.string(),
                control: z.boolean().optional(),
            })
        )
        .max(30),
    keywords: z.array(z.string()).max(20),
    pages: z.number().min(1).max(3).default(2),
    mode: z.enum(['all', 'keywords']).default('all'),
    completed: z.array(z.string()).default([]),
});
const input = inputSchema.parse(
    JSON.parse(process.env.RW_SAMPLE_INLINE ?? readFileSync(process.argv[2] ?? '', 'utf8'))
);
const env = process.env;
const market = 'ATVPDKIKX0DER';
const clocks = new Map<string, number>();
const pace = async (provider: string) => {
    await delay(Math.max(0, (clocks.get(provider) ?? 0) - Date.now()));
    clocks.set(provider, Date.now() + 10000);
};
const json = async (response: Response, label: string): Promise<unknown> => {
    if (!response.ok) {
        console.log(
            JSON.stringify({
                kind: 'error',
                label,
                status: response.status,
                retryAfter: response.headers.get('retry-after'),
            })
        );
        throw new Error(`${label} HTTP ${response.status}`);
    }
    return await response.json();
};
const token = async (kind: 'ads' | 'spapi') => {
    const names =
        kind === 'ads'
            ? [
                  'RANKWRANGLER_ADS_CLIENT_ID',
                  'RANKWRANGLER_ADS_CLIENT_SECRET',
                  'RANKWRANGLER_ADS_REFRESH_TOKEN',
              ]
            : [
                  'RANKWRANGLER_SPAPI_CLIENT_ID',
                  'RANKWRANGLER_SPAPI_APP_CLIENT_SECRET',
                  'RANKWRANGLER_SPAPI_REFRESH_TOKEN',
              ];
    const values = names.map(name => env[name]);
    if (values.some(value => !value)) throw new Error(`${kind} credential missing`);
    const data = await json(
        await fetch('https://api.amazon.com/auth/o2/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: values[0]!,
                client_secret: values[1]!,
                refresh_token: values[2]!,
            }),
            signal: AbortSignal.timeout(20000),
        }),
        `${kind} auth`
    );
    return z.object({ access_token: z.string() }).parse(data).access_token;
};
const ads = async () => {
    if (input.mode === 'keywords') return;
    const access = await token('ads');
    const client = env.RANKWRANGLER_ADS_CLIENT_ID!;
    const profiles = z
        .array(
            z.object({
                profileId: z.number(),
                countryCode: z.string(),
                accountInfo: z.object({ type: z.string() }),
            })
        )
        .parse(
            await json(
                await fetch('https://advertising-api.amazon.com/v2/profiles', {
                    headers: {
                        Authorization: `Bearer ${access}`,
                        'Amazon-Advertising-API-ClientId': client,
                    },
                    signal: AbortSignal.timeout(15000),
                }),
                'ads profiles'
            )
        )
        .filter(profile => profile.countryCode === 'US');
    const profile = profiles.find(row => row.accountInfo.type === 'vendor') ?? profiles[0];
    if (!profile) throw new Error('No US Ads profile');
    const media = 'application/vnd.spkeywordsrecommendation.v5+json';
    for (const product of input.products) {
        if (input.completed.includes(`ads:${product.asin}`)) continue;
        await pace('ads');
        const started = performance.now();
        const data = await json(
            await fetch('https://advertising-api.amazon.com/sp/targets/keywords/recommendations', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${access}`,
                    'Amazon-Advertising-API-ClientId': client,
                    'Amazon-Advertising-API-Scope': String(profile.profileId),
                    'Content-Type': media,
                    Accept: media,
                },
                body: JSON.stringify({
                    recommendationType: 'KEYWORDS_FOR_ASINS',
                    asins: [product.asin],
                    bidsEnabled: false,
                    maxRecommendations: 100,
                    sortDimension: 'CLICKS',
                    locale: 'en_US',
                    targets: [],
                }),
                signal: AbortSignal.timeout(30000),
            }),
            'ads recommendations'
        );
        const terms = z
            .object({ keywordTargetList: z.array(z.object({ keyword: z.string() })) })
            .parse(data)
            .keywordTargetList.map(row => row.keyword);
        console.log(
            JSON.stringify({ kind: 'ads', ...product, ms: performance.now() - started, terms })
        );
    }
};
const autocomplete = async () => {
    if (input.mode === 'keywords') return;
    for (const term of input.keywords) {
        for (const variant of ['current', 'desktop'] as const) {
            if (input.completed.includes(`autocomplete:${term}:${variant}`)) continue;
            await pace('autocomplete');
            const started = performance.now();
            const url =
                variant === 'desktop'
                    ? createKeywordAutocompleteUrl(term)
                    : new URL(
                          `https://completion.amazon.com/api/2017/suggestions?${new URLSearchParams({ limit: '10', prefix: term, 'suggestion-type': 'KEYWORD', alias: 'aps', mid: market })}`
                      );
            const data = await json(
                await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        Accept: 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                    signal: AbortSignal.timeout(15000),
                }),
                'autocomplete'
            );
            const parsed = parseAutocompleteSuggestions(term, data);
            const strict = parsed.filter(suggestion =>
                suggestion.startsWith(`${term.toLowerCase()} `)
            );
            console.log(
                JSON.stringify({
                    kind: 'autocomplete',
                    term,
                    variant,
                    ms: performance.now() - started,
                    terms: parsed,
                    oldParserTerms: strict,
                })
            );
        }
    }
};
const searches = async () => {
    const access = await token('spapi');
    for (const term of input.keywords) {
        if (input.completed.includes(`search:${term}:complete`)) continue;
        let pageToken: string | undefined;
        const seen = new Set<string>();
        for (let page = 0; page < input.pages; page++) {
            await pace('spapi');
            const started = performance.now();
            const params = new URLSearchParams({
                marketplaceIds: market,
                keywords: term,
                includedData: 'summaries,salesRanks,attributes,images',
                pageSize: '20',
                ...(pageToken ? { pageToken } : {}),
            });
            const response = await fetch(
                `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?${params}`,
                {
                    headers: {
                        'x-amz-access-token': access,
                        'user-agent': 'RankWrangler bounded read-only workload study',
                    },
                    signal: AbortSignal.timeout(30000),
                }
            );
            const data = ItemSearchResultsSchema.parse(await json(response, 'spapi keyword'));
            const products = data.items.map(item =>
                mapSpApiCatalogItem(item, market, new Date().toISOString())
            );
            pageToken = data.pagination?.nextToken;
            const repeated = products.filter(product => seen.has(product.asin)).length;
            products.forEach(product => seen.add(product.asin));
            console.log(
                JSON.stringify({
                    kind: 'search',
                    term,
                    page,
                    ms: performance.now() - started,
                    rateLimit: response.headers.get('x-amzn-RateLimit-Limit'),
                    hasNext: Boolean(pageToken),
                    repeated,
                    products: products.map(
                        ({ asin, title, brand, rootCategoryBsr, isMerchListing }) => ({
                            asin,
                            title,
                            brand,
                            bsr: rootCategoryBsr,
                            merch: isMerchListing,
                        })
                    ),
                })
            );
            if (!pageToken || !products.length || repeated === products.length) break;
        }
    }
};
console.log(
    JSON.stringify({
        kind: 'start',
        at: new Date().toISOString(),
        products: input.products.length,
        keywords: input.keywords.length,
        mode: input.mode,
    })
);
const tasks = await Promise.allSettled([ads(), autocomplete(), searches()]);
for (const [index, result] of tasks.entries()) {
    if (result.status === 'rejected')
        console.log(
            JSON.stringify({
                kind: 'laneFailure',
                lane: index,
                error: result.reason instanceof Error ? result.reason.message : 'Unknown failure',
            })
        );
}
console.log(JSON.stringify({ kind: 'complete', at: new Date().toISOString() }));
