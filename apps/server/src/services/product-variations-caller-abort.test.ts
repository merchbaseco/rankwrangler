import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
    clearVariationDiscoveryCachesForTests,
    getProductVariations,
} from './product-variations';
import { RetrievalRetryableError } from './retrieval-coordinator';
import {
    catalogItemFor,
    createCatalogMock,
    DEFAULT_CHILD,
    installStoreSpy,
    MARKETPLACE,
    PARENT,
    SECOND_CHILD,
    waitUntil,
} from './product-variations-test-fixtures';

describe('getProductVariations caller detach', () => {
    afterEach(() => {
        mock.restore();
        clearVariationDiscoveryCachesForTests();
    });

    it('keeps the shared family fetch running after the caller aborts', async () => {
        const { deps, searchCatalogItemsByAsins } = createCatalogMock();
        const controller = new AbortController();
        let releaseChildBatch: (() => void) | undefined;
        let signalChildBatchStarted: (() => void) | undefined;
        const childBatchStarted = new Promise<void>(resolve => {
            signalChildBatchStarted = resolve;
        });
        const childBatchReleased = new Promise<void>(resolve => {
            releaseChildBatch = resolve;
        });
        searchCatalogItemsByAsins.mockImplementation(async ({ asins }) => {
            if (!asins.includes(PARENT)) {
                signalChildBatchStarted?.();
                await childBatchReleased;
            }
            return { items: asins.map(asin => catalogItemFor(asin)) };
        });
        const store = installStoreSpy();

        const pending = getProductVariations(
            {
                marketplaceId: MARKETPLACE,
                asin: PARENT,
                timeoutMs: 5_000,
                signal: controller.signal,
            },
            deps
        );
        await childBatchStarted;
        controller.abort();
        await expect(pending).rejects.toBeInstanceOf(RetrievalRetryableError);

        releaseChildBatch?.();
        await waitUntil(() => store.getRow(MARKETPLACE, PARENT)?.state === 'ready');

        const row = store.getRow(MARKETPLACE, PARENT);
        expect(row?.state).toBe('ready');
        expect(row?.kind).toBe('family');
        expect(row?.children?.map(child => child.asin)).toEqual([DEFAULT_CHILD, SECOND_CHILD]);
    });
});
