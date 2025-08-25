import { SellingPartner as SellingPartnerAPI } from 'amazon-sp-api';
import Bottleneck from 'bottleneck';
import { env } from '@/config/env.js';
import { db } from '@/db/index.js';
import { productCache, systemStats } from '@/db/schema.js';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { SimplifiedCatalogItem, CatalogSearchResponse, ProductInfo, GetCatalogItemResponse } from '@/types/index.js';

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
        await db.update(systemStats)
            .set({ 
                totalSpApiCalls: sql`${systemStats.totalSpApiCalls} + 1`,
                updatedAt: new Date()
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track API call:', error);
    }
}

async function trackCacheHit() {
    try {
        await db.update(systemStats)
            .set({ 
                totalCacheHits: sql`${systemStats.totalCacheHits} + 1`,
                updatedAt: new Date()
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track cache hit:', error);
    }
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
                    includedData: ['attributes', 'identifiers', 'productTypes', 'images', 'salesRanks', 'summaries'],
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
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.title, item])).values());

    // Sort by BSR
    const result = uniqueItems.sort((a, b) => (a.bsr ?? Number.MAX_SAFE_INTEGER) - (b.bsr ?? Number.MAX_SAFE_INTEGER));
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
    const fashionDisplayRank = item.salesRanks?.[0]?.displayGroupRanks?.find((rank: any) => rank.websiteDisplayGroup === 'fashion_display_on_website');
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
    // Check PostgreSQL cache first
    try {
        const cached = await db.select()
            .from(productCache)
            .where(
                and(
                    eq(productCache.marketplaceId, marketplaceId),
                    eq(productCache.asin, asin),
                    gte(productCache.expiresAt, new Date())
                )
            )
            .limit(1);

        if (cached.length > 0) {
            // Update access stats
            await db.update(productCache)
                .set({ 
                    lastAccessedAt: new Date(),
                    accessCount: sql`${productCache.accessCount} + 1`
                })
                .where(eq(productCache.id, cached[0].id));
            
            // Track cache hit
            await trackCacheHit();
            
            console.log(`[${new Date().toISOString()}] Cache hit for ${asin}`);
            
            return {
                ...cached[0].data,
                metadata: {
                    ...cached[0].data.metadata,
                    cached: true
                }
            };
        }
    } catch (error) {
        console.error(`[Cache] Error checking cache for ${asin}:`, error);
    }

    console.log(`[${new Date().toISOString()}] Cache miss for ${asin}, fetching from SP-API`);

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

    const result = parseProductInfo(response, asin);
    
    // Store in PostgreSQL cache
    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
        
        await db.insert(productCache)
            .values({
                marketplaceId,
                asin,
                data: result,
                expiresAt
            })
            .onConflictDoUpdate({
                target: [productCache.marketplaceId, productCache.asin],
                set: {
                    data: result,
                    expiresAt,
                    createdAt: new Date(),
                    accessCount: 0,
                    lastAccessedAt: new Date()
                }
            });
            
        console.log(`[${new Date().toISOString()}] Cached result for ${asin}`);
    } catch (error) {
        console.error(`[Cache] Error caching result for ${asin}:`, error);
    }

    return result;
};

function parseProductInfo(response: GetCatalogItemResponse, asin: string): ProductInfo {
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
            'listing_date'
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
    
    // Extract BSR from salesRanks - look for fashion category rank
    let bsr: number | null = null;
    const salesRanks = item.salesRanks?.[0];
    if (salesRanks?.displayGroupRanks) {
        const fashionRank = salesRanks.displayGroupRanks.find((rank: any) => 
            rank.websiteDisplayGroup === 'fashion_display_on_website'
        );
        bsr = fashionRank?.rank || null;
    }

    return {
        asin,
        creationDate,
        bsr,
        metadata: {
            lastFetched: new Date().toISOString(),
            cached: false,
        },
    };
}