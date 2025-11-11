import { SellingPartner as SellingPartnerAPI } from 'amazon-sp-api';
import Bottleneck from 'bottleneck';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { env } from '@/config/env.js';
import { db } from '@/db/index.js';
import { products, displayGroups, productRankHistory, systemStats } from '@/db/schema.js';
import { getPacificDateString } from '@/utils/date.js';
import type {
    CatalogSearchResponse,
    GetCatalogItemResponse,
    ProductInfo,
    SimplifiedCatalogItem,
} from '@/types/index.js';

// Rate limiter: 2 requests per second with burst of 2 (matches SP-API limits)
const spApiLimiter = new Bottleneck({
    maxConcurrent: 2,
    minTime: 500, // 500ms between requests = 2 per second
    reservoir: 2, // Initial burst capacity
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000, // Refresh every second
});

// Helper functions for stats tracking
async function trackApiCall() {
    try {
        await db
            .update(systemStats)
            .set({
                totalSpApiCalls: sql`${systemStats.totalSpApiCalls} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track API call:', error);
    }
}

async function trackCacheHit() {
    try {
        await db
            .update(systemStats)
            .set({
                totalCacheHits: sql`${systemStats.totalCacheHits} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track cache hit:', error);
    }
}

// Helper function to upsert display group (find or create)
async function upsertDisplayGroup(category: string, link?: string): Promise<string> {
    const existing = await db
        .select()
        .from(displayGroups)
        .where(
            and(
                eq(displayGroups.category, category),
                link ? eq(displayGroups.link, link) : isNull(displayGroups.link)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        return existing[0].id;
    }

    const [newGroup] = await db
        .insert(displayGroups)
        .values({ category, link: link || null })
        .returning({ id: displayGroups.id });

    return newGroup.id;
}


export const searchCatalog = async (keywords: string[]): Promise<SimplifiedCatalogItem[]> => {
    const sellingPartner = new SellingPartnerAPI({
        region: 'na',
        refresh_token: env.SPAPI_REFRESH_TOKEN,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: env.SPAPI_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: env.SPAPI_APP_CLIENT_SECRET,
        },
    });

    let allItems: SimplifiedCatalogItem[] = [];
    let nextToken: string | undefined;
    let currentPage = 0;
    const maxPages = 5;

    do {
        const response: CatalogSearchResponse = await spApiLimiter.schedule(() =>
            sellingPartner.callAPI({
                operation: 'searchCatalogItems',
                endpoint: 'catalogItems',
                path: {},
                query: {
                    keywords,
                    marketplaceIds: 'ATVPDKIKX0DER',
                    includedData: [
                        'attributes',
                        'identifiers',
                        'productTypes',
                        'images',
                        'salesRanks',
                        'summaries',
                    ],
                    classificationIds: ['7147445011'],
                    pageSize: 20,
                    ...(nextToken ? { nextToken } : {}),
                },
                options: {
                    version: '2022-04-01',
                },
            })
        );

        const items = response.items?.map(parseCatalogItem) || [];
        allItems = [...allItems, ...items];
        nextToken = response.pagination?.nextToken;
        currentPage++;
    } while (nextToken && currentPage < maxPages);

    // Deduplicate items based on title
    const uniqueItems = Array.from(new Map(allItems.map(item => [item.title, item])).values());

    // Sort by BSR
    const result = uniqueItems.sort(
        (a, b) => (a.bsr ?? Number.MAX_SAFE_INTEGER) - (b.bsr ?? Number.MAX_SAFE_INTEGER)
    );
    return result;
};

function parseCatalogItem(item: any): SimplifiedCatalogItem {
    const asin = item.asin;
    const title = item.attributes?.item_name?.[0]?.value || '';
    const brand = item.attributes?.brand?.[0]?.value || '';

    // Filter out standard Merch by Amazon bullets.
    const standardBullets = [
        'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
        'Solid colors: 100% Cotton; Heather Grey: 90% Cotton, 10% Polyester; All Other Heathers: 50% Cotton, 50% Polyester',
        '8.5 oz, Classic fit, Twill-taped neck',
        'Machine Wash',
        'Solid color t-shirts are 100% cotton, heather grey is 90% cotton/10% polyester, denim heather is 50% cotton/ 50% polyester',
    ];

    const bulletPoints = (item.attributes?.bullet_point || [])
        .map((bullet: any) => bullet.value)
        .filter((bullet: string) => bullet && !standardBullets.includes(bullet.trim()));

    // Find a medium-sized image (around 500px) or fallback to first available
    const images = item.images?.[0]?.images || [];
    let thumbnailUrl = '';

    // Try to find an image around 500px width first
    const mediumImage = images.find((img: any) => img.width >= 400 && img.width <= 600);
    if (mediumImage) {
        thumbnailUrl = mediumImage.link;
    } else if (images.length > 0) {
        // Fallback to first image
        thumbnailUrl = images[0].link;
    }

    // Get the Clothing, Shoes & Jewelry BSR
    const fashionDisplayRank = item.salesRanks?.[0]?.displayGroupRanks?.find(
        (rank: any) => rank.websiteDisplayGroup === 'fashion_display_on_website'
    );
    const bsr = fashionDisplayRank?.rank || null;

    return {
        asin,
        title,
        brand,
        bulletPoints,
        thumbnailUrl,
        bsr,
    };
}

export const getProductInfo = async (marketplaceId: string, asin: string): Promise<ProductInfo> => {
    if (!marketplaceId || typeof marketplaceId !== 'string') {
        throw new Error('Marketplace ID is required');
    }
    // Check product store first
    try {
        const productRows = await db
            .select()
            .from(products)
            .where(
                and(
                    eq(products.marketplaceId, marketplaceId),
                    eq(products.asin, asin),
                    gte(products.expiresAt, new Date())
                )
            )
            .limit(1);

        if (productRows.length > 0) {
            const product = productRows[0];
            const today = getPacificDateString();

            // Get today's rank history for this product
            const rankHistory = await db
                .select({
                    rank: productRankHistory.bsr,
                    category: displayGroups.category,
                    link: displayGroups.link,
                })
                .from(productRankHistory)
                .innerJoin(displayGroups, eq(productRankHistory.displayGroupId, displayGroups.id))
                .where(
                    and(
                        eq(productRankHistory.productId, product.id),
                        eq(productRankHistory.date, today)
                    )
                )
                .orderBy(productRankHistory.bsr);

            // Track cache hit
            await trackCacheHit();

            console.log(`[${new Date().toISOString()}] Product found in store for ${asin}`);

            // Determine primary BSR (lowest rank)
            const displayGroupRanks = rankHistory.map(rh => ({
                rank: rh.rank,
                category: rh.category,
                link: rh.link || undefined,
            }));

            const bsr = displayGroupRanks.length > 0 ? displayGroupRanks[0].rank : null;
            const bsrCategory = displayGroupRanks.length > 0 ? displayGroupRanks[0].category : null;

            const result: ProductInfo = {
                asin: product.asin,
                marketplaceId: product.marketplaceId,
                creationDate: product.creationDate?.toISOString() || null,
                bsr,
                bsrCategory,
                displayGroupRanks,
                metadata: {
                    lastFetched: product.lastFetched.toISOString(),
                    cached: true,
                },
            };

            console.log(
                `[${new Date().toISOString()}] Product payload for ${asin}: ${JSON.stringify(result)}`
            );

            return result;
        }
    } catch (error) {
        console.error(`[Product Store] Error checking product store for ${asin}:`, error);
    }

    console.log(`[${new Date().toISOString()}] Product not found in store for ${asin}, fetching from SP-API`);

    const sellingPartner = new SellingPartnerAPI({
        region: 'na',
        refresh_token: env.SPAPI_REFRESH_TOKEN,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: env.SPAPI_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: env.SPAPI_APP_CLIENT_SECRET,
        },
    });

    // Track SP-API call
    await trackApiCall();

    // Use rate limiter for SP-API call
    const response: GetCatalogItemResponse = await spApiLimiter.schedule(() =>
        sellingPartner.callAPI({
            operation: 'getCatalogItem',
            endpoint: 'catalogItems',
            path: {
                asin: asin,
            },
            query: {
                marketplaceIds: [marketplaceId],
                includedData: 'attributes,summaries,salesRanks',
            },
            options: {
                version: '2022-04-01',
            },
        })
    );

    const parsedResult = parseProductInfo(response, asin, marketplaceId);
    const result = normalizeProductInfo({
        ...parsedResult,
        metadata: {
            ...parsedResult.metadata,
            cached: false,
        },
    });

    console.log(
        `[${new Date().toISOString()}] SP-API payload for ${asin}: ${JSON.stringify(result)}`
    );

    // Store in product store
    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
        const today = getPacificDateString();
        const creationDate = result.creationDate ? new Date(result.creationDate) : null;

        // Insert or update product
        const [product] = await db
            .insert(products)
            .values({
                marketplaceId,
                asin,
                creationDate,
                lastFetched: new Date(),
                expiresAt,
            })
            .onConflictDoUpdate({
                target: [products.marketplaceId, products.asin],
                set: {
                    creationDate,
                    lastFetched: new Date(),
                    expiresAt,
                    createdAt: new Date(),
                },
            })
            .returning({ id: products.id });

        // Upsert display groups and insert rank history for today
        for (const rank of result.displayGroupRanks) {
            const displayGroupId = await upsertDisplayGroup(rank.category, rank.link);

            // Insert rank history for today (on conflict, update)
            await db
                .insert(productRankHistory)
                .values({
                    productId: product.id,
                    displayGroupId,
                    date: today,
                    bsr: rank.rank,
                })
                .onConflictDoUpdate({
                    target: [
                        productRankHistory.productId,
                        productRankHistory.displayGroupId,
                        productRankHistory.date,
                    ],
                    set: {
                        bsr: rank.rank,
                    },
                });
        }

        console.log(`[${new Date().toISOString()}] Stored product result for ${asin}`);
    } catch (error) {
        console.error(`[Product Store] Error storing result for ${asin}:`, error);
    }

    return result;
};

// Pure SP-API call function (no caching, no stats tracking)
export const getProductInfoFromSpApi = async (
    marketplaceId: string,
    asin: string
): Promise<ProductInfo> => {
    if (!marketplaceId || typeof marketplaceId !== 'string') {
        throw new Error('Marketplace ID is required');
    }

    const sellingPartner = new SellingPartnerAPI({
        region: 'na',
        refresh_token: env.SPAPI_REFRESH_TOKEN,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: env.SPAPI_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: env.SPAPI_APP_CLIENT_SECRET,
        },
    });

    // Use rate limiter for SP-API call
    const response: GetCatalogItemResponse = await spApiLimiter.schedule(() =>
        sellingPartner.callAPI({
            operation: 'getCatalogItem',
            endpoint: 'catalogItems',
            path: {
                asin: asin,
            },
            query: {
                marketplaceIds: [marketplaceId],
                includedData: 'attributes,summaries,salesRanks',
            },
            options: {
                version: '2022-04-01',
            },
        })
    );

    const parsedResult = parseProductInfo(response, asin, marketplaceId);
    const result = normalizeProductInfo({
        ...parsedResult,
        metadata: {
            ...parsedResult.metadata,
            cached: false,
        },
    });

    return result;
};

export const getProductInfoBulk = async (
    marketplaceId: string,
    asins: string[]
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

    const now = new Date();
    const today = getPacificDateString();
    const cachedResults: ProductInfo[] = [];

    try {
        const productEntries = await db
            .select()
            .from(products)
            .where(
                and(
                    eq(products.marketplaceId, marketplaceId),
                    inArray(products.asin, normalizedAsins),
                    gte(products.expiresAt, now)
                )
            );

        const foundAsins: string[] = [];

        for (const product of productEntries) {
            // Get today's rank history for this product
            const rankHistory = await db
                .select({
                    rank: productRankHistory.bsr,
                    category: displayGroups.category,
                    link: displayGroups.link,
                })
                .from(productRankHistory)
                .innerJoin(displayGroups, eq(productRankHistory.displayGroupId, displayGroups.id))
                .where(
                    and(
                        eq(productRankHistory.productId, product.id),
                        eq(productRankHistory.date, today)
                    )
                )
                .orderBy(productRankHistory.bsr);

            // Track cache hit per ASIN to keep stats accurate
            await trackCacheHit();

            const displayGroupRanks = rankHistory.map(rh => ({
                rank: rh.rank,
                category: rh.category,
                link: rh.link || undefined,
            }));

            const bsr = displayGroupRanks.length > 0 ? displayGroupRanks[0].rank : null;
            const bsrCategory = displayGroupRanks.length > 0 ? displayGroupRanks[0].category : null;

            const result: ProductInfo = {
                asin: product.asin,
                marketplaceId: product.marketplaceId,
                creationDate: product.creationDate?.toISOString() || null,
                bsr,
                bsrCategory,
                displayGroupRanks,
                metadata: {
                    lastFetched: product.lastFetched.toISOString(),
                    cached: true,
                },
            };

            cachedResults.push(result);
            foundAsins.push(product.asin);
        }

        const missingAsins = normalizedAsins.filter(asin => !foundAsins.includes(asin));

        if (missingAsins.length === 0) {
            const ordered = normalizedAsins
                .map(asin => cachedResults.find(item => item.asin === asin))
                .filter((item): item is ProductInfo => Boolean(item));

            return {
                products: ordered,
                missing: [],
            };
        }

        console.log(
            `[${new Date().toISOString()}] Product store miss for bulk request: ${missingAsins.join(', ')}`
        );

        const sellingPartner = new SellingPartnerAPI({
            region: 'na',
            refresh_token: env.SPAPI_REFRESH_TOKEN,
            credentials: {
                SELLING_PARTNER_APP_CLIENT_ID: env.SPAPI_CLIENT_ID,
                SELLING_PARTNER_APP_CLIENT_SECRET: env.SPAPI_APP_CLIENT_SECRET,
            },
        });

        // Track SP-API call for this bulk request
        await trackApiCall();

        const response: CatalogSearchResponse = await spApiLimiter.schedule(() =>
            sellingPartner.callAPI({
                operation: 'searchCatalogItems',
                endpoint: 'catalogItems',
                path: {},
                query: {
                    identifiers: missingAsins.join(','),
                    identifiersType: 'ASIN',
                    marketplaceIds: marketplaceId,
                    includedData: ['summaries', 'salesRanks', 'attributes'],
                    pageSize: Math.min(20, missingAsins.length),
                },
                options: {
                    version: '2022-04-01',
                },
            })
        );

        const freshResults: ProductInfo[] = [];
        const missingSet = new Set(missingAsins);

        for (const item of response.items ?? []) {
            const asin = item.asin;

            if (!asin || !missingSet.has(asin)) {
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

            freshResults.push(normalized);
        }

        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours

        for (const product of freshResults) {
            try {
                const creationDate = product.creationDate ? new Date(product.creationDate) : null;

                // Insert or update product
                const [productRow] = await db
                    .insert(products)
                    .values({
                        marketplaceId,
                        asin: product.asin,
                        creationDate,
                        lastFetched: new Date(),
                        expiresAt,
                    })
                    .onConflictDoUpdate({
                        target: [products.marketplaceId, products.asin],
                        set: {
                            creationDate,
                            lastFetched: new Date(),
                            expiresAt,
                            createdAt: new Date(),
                        },
                    })
                    .returning({ id: products.id });

                // Upsert display groups and insert rank history for today
                for (const rank of product.displayGroupRanks) {
                    const displayGroupId = await upsertDisplayGroup(rank.category, rank.link);

                    // Insert rank history for today (on conflict, update)
                    await db
                        .insert(productRankHistory)
                        .values({
                            productId: productRow.id,
                            displayGroupId,
                            date: today,
                            bsr: rank.rank,
                        })
                        .onConflictDoUpdate({
                            target: [
                                productRankHistory.productId,
                                productRankHistory.displayGroupId,
                                productRankHistory.date,
                            ],
                            set: {
                                bsr: rank.rank,
                            },
                        });
                }

                console.log(`[${new Date().toISOString()}] Stored bulk result for ${product.asin}`);
            } catch (error) {
                console.error(`[Product Store] Error storing bulk result for ${product.asin}:`, error);
            }
        }

        const allResultsMap = new Map<string, ProductInfo>();

        for (const product of [...cachedResults, ...freshResults]) {
            allResultsMap.set(product.asin, product);
        }

        const orderedResults = normalizedAsins
            .map(asin => allResultsMap.get(asin))
            .filter((item): item is ProductInfo => Boolean(item));

        const missing = normalizedAsins.filter(asin => !allResultsMap.has(asin));

        if (missing.length > 0) {
            console.warn(
                `[${new Date().toISOString()}] No catalog data returned for ASINs: ${missing.join(
                    ', '
                )}`
            );
        }

        return {
            products: orderedResults,
            missing,
        };
    } catch (error) {
        console.error('[Bulk] Error retrieving product info in bulk:', error);
        throw error;
    }
};

// Pure SP-API bulk call function (no caching, no stats tracking)
export const getProductInfoBulkFromSpApi = async (
    marketplaceId: string,
    asins: string[]
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

    const response: CatalogSearchResponse = await spApiLimiter.schedule(() =>
        sellingPartner.callAPI({
            operation: 'searchCatalogItems',
            endpoint: 'catalogItems',
            path: {},
            query: {
                identifiers: normalizedAsins.join(','),
                identifiersType: 'ASIN',
                marketplaceIds: marketplaceId,
                includedData: ['summaries', 'salesRanks', 'attributes'],
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

    return {
        products: orderedResults,
        missing,
    };
};

function parseProductInfo(response: GetCatalogItemResponse, asin: string, marketplaceId: string): ProductInfo {
    const item = response;

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

    return {
        asin,
        marketplaceId,
        creationDate,
        bsr,
        bsrCategory,
        displayGroupRanks,
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
