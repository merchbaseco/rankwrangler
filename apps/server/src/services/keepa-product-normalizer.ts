const KEEPA_MINUTE_EPOCH_OFFSET = 21_564_000;
const KEEPA_CSV_INDEX = {
    amazonPrice: 0,
    newPrice: 1,
    salesRank: 3,
    newFbaPrice: 10,
} as const;

export type KeepaProductPayload = {
    asin?: string;
    title?: string;
    brand?: string;
    imagesCSV?: string;
    features?: string[];
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
    title: string | null;
    brand: string | null;
    thumbnailUrl: string | null;
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

export type NormalizedKeepaHistoryPoint = {
    metric: string;
    categoryId: number;
    observedAt: Date;
    keepaMinutes: number;
    valueInt: number | null;
    isMissing: boolean;
};

export type NormalizedKeepaProduct = {
    product: NormalizedKeepaProductState;
    historyPoints: NormalizedKeepaHistoryPoint[];
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
    const rootCategoryId = normalizePositiveMetric(product.salesRankReference);
    const listingRootCategoryId =
        normalizePositiveMetric(product.rootCategory) ?? rootCategoryId;

    return {
        product: {
            marketplaceId,
            asin: product.asin,
            title: normalizeText(product.title),
            brand: normalizeText(product.brand),
            thumbnailUrl: normalizeKeepaImage(product.imagesCSV),
            bullet1: normalizeText(product.features?.[0]),
            bullet2: normalizeText(product.features?.[1]),
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
            keepaSalesRankDrops30: normalizeNonNegativeMetric(
                product.stats?.salesRankDrops30
            ),
            keepaSalesRankDrops90: normalizeNonNegativeMetric(
                product.stats?.salesRankDrops90
            ),
            keepaSalesRankDrops180: normalizeNonNegativeMetric(
                product.stats?.salesRankDrops180
            ),
            keepaSalesRankDrops365: normalizeNonNegativeMetric(
                product.stats?.salesRankDrops365
            ),
            keepaFirstTrackedAt: keepaMinuteToOptionalDate(product.trackingSince),
            keepaSourceUpdatedAt: keepaMinuteToOptionalDate(product.lastUpdate),
            keepaFetchedAt: fetchedAt,
        },
        historyPoints: parseKeepaHistoryPoints(product),
    };
};

const parseKeepaHistoryPoints = (product: KeepaProductPayload) => {
    const points: NormalizedKeepaHistoryPoint[] = [];
    const csv = product.csv ?? [];
    const mainCategoryId = normalizePositiveMetric(product.salesRankReference) ?? -1;

    points.push(
        ...parseKeepaPairSeries(csv[KEEPA_CSV_INDEX.salesRank], 'bsr_main', mainCategoryId),
        ...parseKeepaPairSeries(csv[KEEPA_CSV_INDEX.amazonPrice], 'price_amazon', -1),
        ...parseKeepaPairSeries(csv[KEEPA_CSV_INDEX.newPrice], 'price_new', -1),
        ...parseKeepaPairSeries(csv[KEEPA_CSV_INDEX.newFbaPrice], 'price_new_fba', -1)
    );

    for (const [categoryIdKey, series] of Object.entries(product.salesRanks ?? {})) {
        const categoryId = Number(categoryIdKey);
        if (Number.isFinite(categoryId)) {
            points.push(...parseKeepaPairSeries(series, 'bsr_category', categoryId));
        }
    }

    const deduped = new Map<string, NormalizedKeepaHistoryPoint>();
    for (const point of points) {
        deduped.set(`${point.metric}:${point.categoryId}:${point.keepaMinutes}`, point);
    }

    return Array.from(deduped.values()).sort((left, right) => {
        return left.keepaMinutes - right.keepaMinutes;
    });
};

const parseKeepaPairSeries = (
    series: number[] | undefined,
    metric: string,
    categoryId: number
) => {
    if (!series || series.length < 2) {
        return [] as NormalizedKeepaHistoryPoint[];
    }

    const points: NormalizedKeepaHistoryPoint[] = [];
    for (let index = 0; index + 1 < series.length; index += 2) {
        const keepaMinutes = series[index];
        const value = series[index + 1];
        if (!Number.isFinite(keepaMinutes) || !Number.isFinite(value)) {
            continue;
        }

        const isMissing = value < 0;
        points.push({
            metric,
            categoryId,
            observedAt: keepaMinuteToDate(keepaMinutes),
            keepaMinutes,
            valueInt: isMissing ? null : value,
            isMissing,
        });
    }

    return points;
};

const getLatestSeriesValue = (series: number[] | undefined) => {
    if (!series || series.length < 2) {
        return undefined;
    }

    return series[series.length - 1];
};

const getCurrentPositiveMetric = (current: number | undefined, series: number[] | undefined) => {
    return normalizePositiveMetric(current) ?? normalizePositiveMetric(getLatestSeriesValue(series));
};

const normalizePositiveMetric = (value: number | undefined) => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
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
    return imageName
        ? `https://images-na.ssl-images-amazon.com/images/I/${imageName}`
        : null;
};

const keepaMinuteToOptionalDate = (keepaMinutes: number | undefined) => {
    return normalizePositiveMetric(keepaMinutes) === null ? null : keepaMinuteToDate(keepaMinutes!);
};

const keepaMinuteToDate = (keepaMinutes: number) => {
    return new Date((keepaMinutes + KEEPA_MINUTE_EPOCH_OFFSET) * 60 * 1000);
};
