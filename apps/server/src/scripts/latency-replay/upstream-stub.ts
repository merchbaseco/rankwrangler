// Preloaded into a local development server by `latency-replay` (`tsx --import`), never imported by
// the application. Keepa search and product answer from here after calibrated delays; every other
// non-loopback host fails closed, so a replay never spends a provider key.
import http from 'node:http';
import https from 'node:https';
// @ts-expect-error - SDK doesn't export types properly in package.json
import { CatalogitemsSpApi } from '@amazon-sp-api-release/amazon-sp-api-sdk-js';

const keepaSearchMs = Number(process.env.RW_REPLAY_KEEPA_SEARCH_MS ?? 14_000);
const keepaProductMs = Number(process.env.RW_REPLAY_KEEPA_PRODUCT_MS ?? 2000);
const spApiCatalogMs = Number(process.env.RW_REPLAY_SPAPI_CATALOG_MS ?? 700);
// Share of a search's results RankWrangler has never resolved; they need SP-API before answering.
const newProductShare = Number(process.env.RW_REPLAY_NEW_PRODUCT_SHARE ?? 1);
const asins = (process.env.RW_REPLAY_ASINS ?? '').split(',').filter(Boolean);
const resultsPerSearch = 20;
const bucket = { refillRate: 100, refillIn: 30_000, tokensLeft: 6000 };
const searchCost = 30;

if (asins.length === 0) {
    throw new Error('RW_REPLAY_ASINS must list seeded ASINs for the Keepa stand-in to return.');
}

let inFlight = 0;
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (isLoopback(url.hostname)) {
        return await realFetch(input, init);
    }
    if (url.hostname === 'api.amazon.com' && url.pathname === '/auth/o2/token') {
        return json({ access_token: 'latency-replay', token_type: 'bearer', expires_in: 3600 });
    }
    if (url.hostname !== 'api.keepa.com') {
        throw new Error(`latency-replay: upstream ${url.hostname} is disabled`);
    }
    if (url.pathname === '/token') {
        return json({ ...bucket, tokensConsumed: 0 });
    }
    if (url.pathname === '/product') {
        await new Promise(resolve => setTimeout(resolve, keepaProductMs));
        const requested = (url.searchParams.get('asin') ?? '').split(',').filter(Boolean);
        return json({
            ...bucket,
            tokensConsumed: requested.length,
            products: requested.map(asin => ({ asin, title: `Replay ${asin}`, csv: [] })),
        });
    }
    if (url.pathname !== '/search') {
        return json({ ...bucket, tokensConsumed: 0, error: { type: 'replayDisabled' } }, 503);
    }
    const term = url.searchParams.get('term') ?? '';
    inFlight += 1;
    const started = Date.now();
    console.log(`[replay-stub] keepa.search start inFlight=${inFlight} term="${term}"`);
    try {
        await new Promise(resolve => setTimeout(resolve, keepaSearchMs));
    } finally {
        inFlight -= 1;
    }
    console.log(`[replay-stub] keepa.search end ms=${Date.now() - started} term="${term}"`);
    return json({ ...bucket, tokensConsumed: searchCost, products: productsFor(term) });
};

for (const module of [http, https]) {
    const request = module.request as (...args: unknown[]) => http.ClientRequest;
    const guarded = (...args: unknown[]) => {
        const host = hostOf(args[0]);
        if (host && !isLoopback(host)) {
            throw new Error(`latency-replay: upstream ${host} is disabled`);
        }
        return request(...args);
    };
    module.request = guarded as typeof module.request;
    module.get = ((...args: unknown[]) => {
        const req = guarded(...args);
        req.end();
        return req;
    }) as typeof module.get;
}

// A long-tail term mostly surfaces Products RankWrangler has never resolved: stable new ASINs per
// term, so a repeated term finds them stored. The rest are seeded, already-resolved Products.
const productsFor = (term: string) => {
    const start = hash(term) % asins.length;
    const fresh = Math.round(resultsPerSearch * newProductShare);
    return Array.from({ length: resultsPerSearch }, (_, index) => ({
        asin:
            index < fresh
                ? `B0R${(hash(`${term}#${index}`) % 36 ** 7).toString(36).toUpperCase().padStart(7, '0')}`
                : asins[(start + index) % asins.length],
        title: `${term} shirt ${index + 1}`,
        brand: 'Replay',
        csv: [],
    }));
};

// SP-API Catalog search answers through the SDK the provider uses, after a calibrated delay.
CatalogitemsSpApi.CatalogApi.prototype.searchCatalogItems = async function (
    marketplaceIds: string[],
    options: { identifiers?: string[] }
) {
    await new Promise(resolve => setTimeout(resolve, spApiCatalogMs));
    const marketplaceId = marketplaceIds[0];
    return {
        items: (options.identifiers ?? []).map(asin => ({
            asin,
            summaries: [{ marketplaceId, itemName: `Replay ${asin}`, brand: 'Replay' }],
            images: [
                {
                    marketplaceId,
                    images: [{ variant: 'MAIN', link: `https://m.media-amazon.com/${asin}.jpg` }],
                },
            ],
            salesRanks: [
                {
                    marketplaceId,
                    displayGroupRanks: [{ title: 'Clothing', rank: 1000 + (hash(asin) % 900_000) }],
                },
            ],
        })),
    };
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const hostOf = (target: unknown) => {
    if (typeof target === 'string') return new URL(target).hostname;
    if (target instanceof URL) return target.hostname;
    if (target && typeof target === 'object') {
        const options = target as { hostname?: string | null; host?: string | null };
        return options.hostname ?? options.host?.split(':')[0] ?? null;
    }
    return null;
};

const isLoopback = (host: string) =>
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';

const hash = (value: string) => {
    let result = 0;
    for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
    return result;
};
