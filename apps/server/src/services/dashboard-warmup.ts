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

/**
 * Runs the dashboard's default reads once after a restart, inside the interactive scope: the
 * aggregate caches fill (seconds of work when cold), and the request pool opens connections and
 * prepares its statements, so the first visit after a deploy is as fast as later ones. Inputs go
 * through the procedures' schemas, so cache keys match what the dashboard sends.
 */
export const warmDashboard = () =>
    runInteractive(async () => {
        const started = performance.now();
        const grids = () =>
            Promise.all([
                searchAppProducts(appProductSearchInput.parse(defaultExplorePage)),
                readKeywordDirectoryWithDetail(appKeywordDirectoryInput.parse(defaultKeywordPage)),
            ]);
        await Promise.all([
            readCachedProductSearchFacets(productSearchFacetsInput.parse(defaultExploreFilters)),
            readCachedKeywordDirectoryFacets(
                keywordDirectoryFacetsInput.parse(defaultKeywordFilters)
            ),
            grids(),
            grids(),
        ]);
        const ms = Math.round(performance.now() - started);
        console.log(`[Server] Dashboard reads warmed in ${ms}ms`);
    });
