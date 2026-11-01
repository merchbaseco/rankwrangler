import {
    classifyMerchListing,
    findUnmatchedMerchPackage,
    type MerchListingClassification,
} from '@/services/merch-listing-classification';
import type { SpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import {
    type CatalogItem,
    ItemSearchResultsSchema,
    readCatalogListingEvidence,
} from './search-catalog-items-schema';

const MAX_ASINS_PER_REQUEST = 20;

export interface ClassifiedCatalogItem {
    readonly item: CatalogItem;
    readonly merch: MerchListingClassification;
}

/**
 * Classifies catalog items as Merch. Most variation parents carry no package data, so a parent
 * with no Merch evidence of its own, no product identifier and no description takes its first
 * child's verdict, seller bullets included. Children missing from `items` come from the ASIN
 * catalog search at the caller's priority; a child that isn't returned leaves the parent's own
 * verdict.
 */
export const classifyCatalogItems = async ({
    items,
    marketplaceId,
    priority,
    provider,
}: {
    items: readonly CatalogItem[];
    marketplaceId: string;
    priority?: 'foreground' | 'background';
    provider: Pick<SpApiProvider, 'searchCatalogItemsByAsins'>;
}): Promise<ClassifiedCatalogItem[]> => {
    const observed = items.map(item => ({ item, ...classifyOwnEvidence(item, marketplaceId) }));
    const verdicts = new Map(observed.map(entry => [entry.item.asin.toUpperCase(), entry.merch]));
    const missingChildren = [
        ...new Set(
            observed.flatMap(entry =>
                entry.childAsin && !verdicts.has(entry.childAsin) ? [entry.childAsin] : []
            )
        ),
    ];
    for (let index = 0; index < missingChildren.length; index += MAX_ASINS_PER_REQUEST) {
        const response = ItemSearchResultsSchema.parse(
            await provider.searchCatalogItemsByAsins({
                asins: missingChildren.slice(index, index + MAX_ASINS_PER_REQUEST),
                marketplaceId,
                priority,
            })
        );
        for (const child of response.items) {
            verdicts.set(child.asin.toUpperCase(), classifyOwnEvidence(child, marketplaceId).merch);
        }
    }

    return observed.map(({ item, merch, childAsin }) => ({
        item,
        merch: (childAsin ? verdicts.get(childAsin) : undefined) ?? merch,
    }));
};

const classifyOwnEvidence = (item: CatalogItem, marketplaceId: string) => {
    const evidence = readCatalogListingEvidence(item, marketplaceId);
    const merch = classifyMerchListing(evidence.merch);
    const unmatched = evidence.isVariationParent ? null : findUnmatchedMerchPackage(evidence.merch);
    if (unmatched) {
        console.warn(
            `[Merch Classification] ${item.asin} has a Merch template bullet but an unknown ` +
                `package profile ${unmatched.dimensionsInches.map(formatNumber).join(' x ')} in, ` +
                `${formatNumber(unmatched.weightPounds)} lb`
        );
    }
    const takesChildVerdict =
        evidence.isVariationParent &&
        !merch.isMerchListing &&
        !evidence.merch.hasProductIdentifier &&
        !evidence.hasProductDescription;
    return { merch, childAsin: takesChildVerdict ? evidence.firstChildAsin : null };
};

const formatNumber = (value: number) => String(Math.round(value * 1000) / 1000);
