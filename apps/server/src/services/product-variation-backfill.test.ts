import { describe, expect, it, mock } from 'bun:test';
import { CatalogCapacityDeferredError } from './discovery-types';
import {
    backfillProductVariations,
    VARIATION_BACKFILL_BATCHES_PER_RUN,
} from './product-variation-backfill';

const identity = (asin: string) => ({ marketplaceId: 'ATVPDKIKX0DER', asin });

describe('backfillProductVariations', () => {
    it('re-reads unchecked Products at background priority until none remain', async () => {
        const pages = [[identity('B000000001'), identity('B000000002')], []];
        const deps = {
            readUnchecked: mock(() => Promise.resolve(pages.shift() ?? [])),
            searchCatalogItemsByAsins: mock(() => Promise.resolve([])),
            persistProductSyncResults: mock(() => Promise.resolve()),
        };

        const result = await backfillProductVariations(deps);

        expect(result).toEqual({ didWork: true, batches: 1, checked: 2 });
        expect(deps.searchCatalogItemsByAsins).toHaveBeenCalledWith(
            'ATVPDKIKX0DER',
            ['B000000001', 'B000000002'],
            { priority: 'background' }
        );
        expect(deps.persistProductSyncResults).toHaveBeenCalledTimes(1);
    });

    it('waits for the next run while background capacity is deferred', async () => {
        const deps = {
            readUnchecked: mock(() => Promise.resolve([identity('B000000004')])),
            searchCatalogItemsByAsins: mock(() =>
                Promise.reject(new CatalogCapacityDeferredError('paused', new Date()))
            ),
            persistProductSyncResults: mock(() => Promise.resolve()),
        };

        const result = await backfillProductVariations(deps);

        expect(result).toEqual({ didWork: false, batches: 0, checked: 0 });
        expect(deps.persistProductSyncResults).not.toHaveBeenCalled();
    });

    it('stops after its per-run batch budget', async () => {
        const deps = {
            readUnchecked: mock(() => Promise.resolve([identity('B000000003')])),
            searchCatalogItemsByAsins: mock(() => Promise.resolve([])),
            persistProductSyncResults: mock(() => Promise.resolve()),
        };

        const result = await backfillProductVariations(deps);

        expect(result.batches).toBe(VARIATION_BACKFILL_BATCHES_PER_RUN);
        expect(deps.searchCatalogItemsByAsins).toHaveBeenCalledTimes(
            VARIATION_BACKFILL_BATCHES_PER_RUN
        );
    });
});
