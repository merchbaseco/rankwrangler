import { classifyMerchListing, type BulletEvidence } from '@/services/merch-listing-classification';
import {
    type KeepaHistorySeries,
    keepaMinuteToDate,
    parseKeepaInterleavedSeries,
} from '@/services/keepa-history-series';

const KEEPA_CSV_INDEX = {
    amazonPrice: 0,
    newPrice: 1,
    salesRank: 3,
    newFbaPrice: 10,
} as const;

export type KeepaProductPayload = {
    asin?: string;
    parentAsin?: string | null;
    title?: string;
    brand?: string;
    imagesCSV?: string;
    features?: string[] | null;
    partNumber?: string | null;
    model?: string | null;
    listedSince?: number;
    rootCategory?: number;
    trackingSince?: number;
    lastUpdate?: number;
    monthlySold?: number;
    csv?: number[][];
    salesRanks?: Record<string, number[]>;
    salesRankReference?: number;
    stats?: {
        current?: number[];
        avg30?: number[];
        avg90?: number[];
        salesRankDrops30?: number;
        salesRankDrops90?: number;
        salesRankDrops180?: number;
        salesRankDrops365?: number;
    };
};

export type NormalizedKeepaProductState = {
    marketplaceId: string;
    asin: string;
    // The variation parent Keepa reports; null for a listing without variants (or a parent itself).
    parentAsin: string | null;
    title: string | null;
    brand: string | null;
    thumbnailUrl: string | null;
    isMerchListing: boolean | null;
    bullet1: string | null;
    bullet2: string | null;
    dateFirstAvailable: Date | null;
    rootCategoryId: number | null;
    rootCategoryBsr: number | null;
    keepaRootCategoryId: number | null;
    keepaCurrentBsr: number | null;
    keepaCurrentNewPrice: number | null;
    keepaMonthlySold: number | null;
    keepaBsrAverage30: number | null;
    keepaBsrAverage90: number | null;
    keepaSalesRankDrops30: number | null;
    keepaSalesRankDrops90: number | null;
    keepaSalesRankDrops180: number | null;
    keepaSalesRankDrops365: number | null;
    keepaFirstTrackedAt: Date | null;
    keepaSourceUpdatedAt: Date | null;
    keepaFetchedAt: Date;
};

export type NormalizedKeepaProduct = {
    product: NormalizedKeepaProductState;
    historySeries: KeepaHistorySeries[];
};

export const normalizeKeepaProduct = ({
    marketplaceId,
    product,
    fetchedAt,
}: {
    marketplaceId: string;
    product: KeepaProductPayload;
    fetchedAt: Date;
}): NormalizedKeepaProduct => {
    if (!product.asin) {
        throw new Error('Keepa Product payload is missing an ASIN');
    }

    const currentBsr = getCurrentPositiveMetric(
        product.stats?.current?.[KEEPA_CSV_INDEX.salesRank],
        product.csv?.[KEEPA_CSV_INDEX.salesRank]
    );
    const rootCategoryId = normalizeCategoryId(product.salesRankReference);
    const listingRootCategoryId = normalizeCategoryId(product.rootCategory) ?? rootCategoryId;
    const merchClassification = classifyMerchListing({
        bullets: getKeepaBulletEvidence(product.features),
        partNumber: product.partNumber ?? null,
        modelNumber: product.model ?? null,
        title: product.title ?? null,
    });

    return {
        product: {
            marketplaceId,
            asin: product.asin,
            parentAsin:
                product.parentAsin && product.parentAsin !== product.asin
                    ? product.parentAsin.toUpperCase()
                    : null,
            title: normalizeText(product.title),
            brand: normalizeText(product.brand),
            thumbnailUrl: normalizeKeepaImage(product.imagesCSV),
            isMerchListing: merchClassification?.isMerchListing ?? null,
            bullet1: merchClassification?.bullet1 ?? null,
            bullet2: merchClassification?.bullet2 ?? null,
            dateFirstAvailable: keepaMinuteToOptionalDate(product.listedSince),
            rootCategoryId: listingRootCategoryId,
            rootCategoryBsr: currentBsr,
            keepaRootCategoryId: rootCategoryId,
            keepaCurrentBsr: currentBsr,
            keepaCurrentNewPrice: getCurrentPositiveMetric(
                product.stats?.current?.[KEEPA_CSV_INDEX.newPrice],
                product.csv?.[KEEPA_CSV_INDEX.newPrice]
            ),
            keepaMonthlySold: normalizePositiveMetric(product.monthlySold),
            keepaBsrAverage30: normalizePositiveMetric(
                product.stats?.avg30?.[KEEPA_CSV_INDEX.salesRank]
            ),
            keepaBsrAverage90: normalizePositiveMetric(
                product.stats?.avg90?.[KEEPA_CSV_INDEX.salesRank]
            ),
            keepaSalesRankDrops30: normalizeNonNegativeMetric(product.stats?.salesRankDrops30),
            keepaSalesRankDrops90: normalizeNonNegativeMetric(product.stats?.salesRankDrops90),
            keepaSalesRankDrops180: normalizeNonNegativeMetric(product.stats?.salesRankDrops180),
            keepaSalesRankDrops365: normalizeNonNegativeMetric(product.stats?.salesRankDrops365),
            keepaFirstTrackedAt: keepaMinuteToOptionalDate(product.trackingSince),
            keepaSourceUpdatedAt: keepaMinuteToOptionalDate(product.lastUpdate),
            keepaFetchedAt: fetchedAt,
        },
        historySeries: parseKeepaHistorySeries(product),
    };
};

const getKeepaBulletEvidence = (features: string[] | null | undefined): BulletEvidence => {
    if (features === null || features === undefined) {
        return { kind: 'unavailable' };
    }

    return { kind: 'available', bullets: features };
};

const parseKeepaHistorySeries = (product: KeepaProductPayload) => {
    const csv = product.csv ?? [];
    const mainCategoryId = normalizePositiveMetric(product.salesRankReference) ?? -1;
    const series = [
        parseKeepaInterleavedSeries('bsr_main', mainCategoryId, csv[KEEPA_CSV_INDEX.salesRank]),
        parseKeepaInterleavedSeries('price_amazon', -1, csv[KEEPA_CSV_INDEX.amazonPrice]),
        parseKeepaInterleavedSeries('price_new', -1, csv[KEEPA_CSV_INDEX.newPrice]),
        parseKeepaInterleavedSeries('price_new_fba', -1, csv[KEEPA_CSV_INDEX.newFbaPrice]),
    ];
    for (const [categoryIdKey, categorySeries] of Object.entries(product.salesRanks ?? {})) {
        const categoryId = Number(categoryIdKey);
        if (Number.isFinite(categoryId)) {
            series.push(parseKeepaInterleavedSeries('bsr_category', categoryId, categorySeries));
        }
    }

    return series.filter((entry): entry is KeepaHistorySeries => entry !== null);
};

const getLatestSeriesValue = (series: number[] | undefined) => {
    if (!series || series.length < 2) {
        return undefined;
    }

    return series[series.length - 1];
};

const getCurrentPositiveMetric = (current: number | undefined, series: number[] | undefined) => {
    return (
        normalizePositiveMetric(current) ?? normalizePositiveMetric(getLatestSeriesValue(series))
    );
};

const normalizePositiveMetric = (value: number | undefined) => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
};

// Keepa sends Long.MAX_VALUE (2^63 - 1) when a listing has no category; it parses past the safe
// integer range and overflows a bigint column, so only safe positive integers are category ids.
const normalizeCategoryId = (value: number | undefined) => {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
};

const normalizeNonNegativeMetric = (value: number | undefined) => {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
};

const normalizeText = (value: string | undefined) => {
    const normalized = value?.trim();
    return normalized ? normalized : null;
};

const normalizeKeepaImage = (imagesCsv: string | undefined) => {
    const imageName = imagesCsv?.split(',')[0]?.trim();
    return imageName ? `https://images-na.ssl-images-amazon.com/images/I/${imageName}` : null;
};

const keepaMinuteToOptionalDate = (keepaMinutes: number | undefined) => {
    return normalizePositiveMetric(keepaMinutes) === null ? null : keepaMinuteToDate(keepaMinutes!);
};
