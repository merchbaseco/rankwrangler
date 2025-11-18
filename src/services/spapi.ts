import { SellingPartner as SellingPartnerAPI } from 'amazon-sp-api';
import Bottleneck from 'bottleneck';
import { env } from '@/config/env.js';
import { trackSpApiCall } from '@/services/posthog.js';
import type {
    CatalogSearchResponse,
    ProductInfo,
} from '@/types/index.js';

// Rate limiter: 2 requests per second with burst of 2 (matches SP-API limits)
const spApiLimiter = new Bottleneck({
    maxConcurrent: 2,
    minTime: 500, // 500ms between requests = 2 per second
    reservoir: 2, // Initial burst capacity
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000, // Refresh every second
});

// Get product info using searchCatalogItems API (supports single or multiple ASINs)
export const searchCatalogItems = async (
    marketplaceId: string,
    asins: string[],
    caller: string
): Promise<{ products: ProductInfo[]; missing: string[] }> => {
    if (!marketplaceId || typeof marketplaceId !== 'string') {
        throw new Error('Marketplace ID is required');
    }

    const normalizedAsins = Array.from(
        new Set(
            asins
                .map(asin => asin.trim().toUpperCase())
                .filter(asin => asin.length > 0)
        )
    );

    if (normalizedAsins.length === 0) {
        return {
            products: [],
            missing: [],
        };
    }

    const sellingPartner = new SellingPartnerAPI({
        region: 'na',
        refresh_token: env.SPAPI_REFRESH_TOKEN,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: env.SPAPI_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: env.SPAPI_APP_CLIENT_SECRET,
        },
    });

    // Always track SP-API call
    trackSpApiCall({
        caller,
        apiName: 'searchCatalogItems',
    });

    const response: CatalogSearchResponse = await spApiLimiter.schedule(() =>
        sellingPartner.callAPI({
            operation: 'searchCatalogItems',
            endpoint: 'catalogItems',
            path: {},
            query: {
                identifiers: normalizedAsins.join(','),
                identifiersType: 'ASIN',
                marketplaceIds: marketplaceId,
                includedData: ['summaries', 'salesRanks', 'attributes', 'images'],
                pageSize: Math.min(20, normalizedAsins.length),
            },
            options: {
                version: '2022-04-01',
            },
        })
    );

    const results: ProductInfo[] = [];
    const foundAsins = new Set<string>();

    for (const item of response.items ?? []) {
        const asin = item.asin;

        if (!asin || !normalizedAsins.includes(asin)) {
            continue;
        }

        const parsed = parseProductInfo(item, asin, marketplaceId);
        const normalized = normalizeProductInfo({
            ...parsed,
            metadata: {
                ...parsed.metadata,
                cached: false,
            },
        });

        results.push(normalized);
        foundAsins.add(asin);
    }

    const orderedResults = normalizedAsins
        .map(asin => results.find(item => item.asin === asin))
        .filter((item): item is ProductInfo => Boolean(item));

    const missing = normalizedAsins.filter(asin => !foundAsins.has(asin));

    if (missing.length > 0) {
        console.warn(
            `[${new Date().toISOString()}] No catalog data returned for ASINs: ${missing.join(', ')}`
        );
    }

    return {
        products: orderedResults,
        missing,
    };
};

function parseProductInfo(item: any, asin: string, marketplaceId: string): ProductInfo {

    // Try multiple date field locations
    let creationDate: string | null = null;

    // Check attributes for date fields
    if (item.attributes) {
        // Look for various date-related attributes
        const dateFields = [
            'product_site_launch_date',
            'date_first_available',
            'date_first_listed',
            'street_date',
            'first_available_date',
            'listing_date',
        ];

        for (const field of dateFields) {
            if (item.attributes[field]) {
                const dateValue = Array.isArray(item.attributes[field])
                    ? item.attributes[field][0]?.value
                    : item.attributes[field];
                if (dateValue) {
                    creationDate = dateValue;
                    break;
                }
            }
        }
    }

    // Fallback to summaries release date if no attribute date found
    if (!creationDate) {
        creationDate = item.summaries?.[0]?.releaseDate || null;
    }

    // Extract display group rankings only
    const displayGroupRanks: Array<{ rank: number; category: string; link?: string }> = [];
    const salesRanks = item.salesRanks?.[0];
    
    if (salesRanks) {
        // Add displayGroupRanks (broader categories)
        if (salesRanks.displayGroupRanks) {
            for (const displayRank of salesRanks.displayGroupRanks) {
                if (displayRank.rank && displayRank.title) {
                    displayGroupRanks.push({
                        rank: displayRank.rank,
                        category: displayRank.title,
                        link: displayRank.link,
                    });
                }
            }
        }
    }
    
    // Sort by rank (lowest/best first)
    displayGroupRanks.sort((a, b) => a.rank - b.rank);
    
    // Determine primary BSR (first display group rank)
    let bsr: number | null = null;
    let bsrCategory: string | null = null;
    
    if (displayGroupRanks.length > 0) {
        bsr = displayGroupRanks[0].rank;
        bsrCategory = displayGroupRanks[0].category;
    }

    // Extract thumbnail URL from images
    let thumbnailUrl: string | undefined;
    if (item.images?.[0]?.images?.[0]?.link) {
        thumbnailUrl = item.images[0].images[0].link;
    }

    return {
        asin,
        marketplaceId,
        creationDate,
        bsr,
        bsrCategory,
        displayGroupRanks,
        thumbnailUrl,
        metadata: {
            lastFetched: new Date().toISOString(),
            cached: false,
        },
    };
}

function normalizeProductInfo(data: ProductInfo): ProductInfo {
    const displayGroupRanks = Array.isArray(data.displayGroupRanks)
        ? data.displayGroupRanks
        : [];

    let bsr =
        typeof data.bsr === 'number' && Number.isFinite(data.bsr) ? data.bsr : null;
    let bsrCategory =
        typeof data.bsrCategory === 'string' && data.bsrCategory.length > 0
            ? data.bsrCategory
            : null;

    if (bsr === null && displayGroupRanks.length > 0) {
        bsr = displayGroupRanks[0].rank ?? null;
        bsrCategory = displayGroupRanks[0].category ?? bsrCategory;
    }

    if (!bsrCategory && displayGroupRanks.length > 0) {
        bsrCategory = displayGroupRanks[0].category ?? null;
    }

    if (bsr !== null && !bsrCategory) {
        bsrCategory = 'Unknown Category';
    }

    const metadata = {
        lastFetched: data.metadata?.lastFetched ?? new Date().toISOString(),
        cached: Boolean(data.metadata?.cached),
    };

    return {
        ...data,
        bsr,
        bsrCategory,
        displayGroupRanks,
        metadata,
    };
}
