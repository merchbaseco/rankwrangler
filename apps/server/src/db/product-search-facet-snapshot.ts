import { eq } from 'drizzle-orm';
import { defaultExploreFilters } from '@/api/dashboard-default-views';
import { productSearchFacetsInput } from '@/api/product-search-input';
import { db } from './index';
import { type ProductSearchFacets, readProductSearchFacets } from './product-search-facets';
import { productSearchFacetSnapshot } from './product-search-facet-snapshot-schema';

/** The facets input of Explore's default view, as the procedure parses it. */
export const defaultFacetsInput = productSearchFacetsInput.parse(defaultExploreFilters);
const defaultFacetsKey = JSON.stringify(defaultFacetsInput);

/** Whether a parsed facets input is the default view the snapshot answers. */
export const isDefaultFacetsInput = (input: unknown) => JSON.stringify(input) === defaultFacetsKey;

/** The stored default-view facets, or null before the first count. */
export const readProductSearchFacetSnapshot = async () => {
    const [row] = await db
        .select()
        .from(productSearchFacetSnapshot)
        .where(eq(productSearchFacetSnapshot.id, 1));
    return row ? { observedAt: row.observedAt, facets: row.facets as ProductSearchFacets } : null;
};

/**
 * Counts the default view exactly over every matching Product (a sequential read of the catalog,
 * so only the background job runs it) and replaces the snapshot.
 */
export const refreshProductSearchFacetSnapshot = async (now = new Date()) => {
    const facets = await readProductSearchFacets(defaultFacetsInput, now, { exhaustive: true });
    await db
        .insert(productSearchFacetSnapshot)
        .values({ id: 1, observedAt: now, facets })
        .onConflictDoUpdate({
            target: productSearchFacetSnapshot.id,
            set: { observedAt: now, facets },
        });
    return { observedAt: now.toISOString(), total: facets.total };
};
