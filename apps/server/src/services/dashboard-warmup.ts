import {
    defaultExploreFilters,
    defaultExplorePage,
    defaultKeywordFilters,
    defaultKeywordPage,
} from '@/api/dashboard-default-views';
import {
    appKeywordDirectoryInput,
    keywordDirectoryFacetsInput,
} from '@/api/keyword-directory-input';
import { appProductSearchInput, productSearchFacetsInput } from '@/api/product-search-input';
import { runInteractive } from '@/db/index';
import { readKeywordDirectoryWithDetail } from '@/db/keyword-directory';
import {
    readCachedKeywordDirectoryFacets,
    readCachedProductSearchFacets,
} from './dashboard-aggregates';
import { searchAppProducts } from './product-app-search';

/** After start-up's own connections settle; the database allows few connections in all. */
const DASHBOARD_WARM_DELAY_MS = 15_000;

/**
 * Warms what the first dashboard request after a restart would otherwise wait for: Cloudflare
 * signing keys at once (not in development, which has no issuer), and the dashboard's default
 * reads shortly after.
 */
export const scheduleStartupWarmup = (warmSigningKeys: () => Promise<void>) => {
    if (process.env.NODE_ENV !== 'development') {
        warmSigningKeys().catch(error =>
            console.error('[Server] Signing key warm-up failed:', error)
        );
    }
    setTimeout(() => {
        warmDashboard().catch(error => console.error('[Server] Dashboard warm-up failed:', error));
    }, DASHBOARD_WARM_DELAY_MS).unref();
};

/**
 * Runs the dashboard's default reads once after a restart, one at a time inside the interactive
 * scope: the aggregate caches fill (seconds of work when cold), and the request pool opens a
 * connection and prepares its statements, so the first visit after a deploy is as fast as later
 * ones. Inputs go through the procedures' schemas, so cache keys match what the dashboard sends.
 */
const warmDashboard = () =>
    runInteractive(async () => {
        const started = performance.now();
        await readCachedProductSearchFacets(productSearchFacetsInput.parse(defaultExploreFilters));
        await readCachedKeywordDirectoryFacets(
            keywordDirectoryFacetsInput.parse(defaultKeywordFilters)
        );
        await searchAppProducts(appProductSearchInput.parse(defaultExplorePage));
        await readKeywordDirectoryWithDetail(appKeywordDirectoryInput.parse(defaultKeywordPage));
        const ms = Math.round(performance.now() - started);
        console.log(`[Server] Dashboard reads warmed in ${ms}ms`);
    });
