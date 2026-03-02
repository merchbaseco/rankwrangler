import {
    apparelCategorySignals,
    apparelSignals,
    intentSignals,
    nonPodBrandOrIpSignals,
    nonPodCommoditySignals,
    seasonalSignals,
} from '@/services/spapi/ba-keyword-signals';
import {
    isColorGenderGenericApparelTerm,
    isShortGenericApparelTerm,
} from '@/services/spapi/ba-keyword-term-heuristics';

export type RawBaSearchTermsRow = {
    searchTerm?: string;
    searchFrequencyRank?: number;
    clickShare?: number;
    conversionShare?: number;
    topClickedCategories?: string | string[];
    [key: string]: unknown;
};

export type BaKeywordRow = {
    searchTerm: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
    topRowsCount: number;
    isMerchRelevant: boolean;
    merchReason: string;
};

type BaKeywordAccumulator = {
    searchTerm: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
    topRowsCount: number;
    merchReason: string;
};

export const classifyMerchKeyword = (searchTerm: string, topClickedCategories: string[] = []) => {
    const normalized = normalizeSearchTerm(searchTerm);
    const hasApparelCategory = topClickedCategories.some((category) =>
        apparelCategorySignals.some((signal) => signal.pattern.test(category))
    );

    if (!hasApparelCategory) {
        return {
            isMerchRelevant: false,
            merchReason: 'none',
        };
    }

    const commodity = nonPodCommoditySignals.find((signal) => signal.pattern.test(normalized));
    if (commodity) {
        return {
            isMerchRelevant: false,
            merchReason: `blocked:${commodity.key}`,
        };
    }

    const brandOrIp = nonPodBrandOrIpSignals.find((signal) => signal.pattern.test(normalized));
    if (brandOrIp) {
        return {
            isMerchRelevant: false,
            merchReason: `blocked:${brandOrIp.key}`,
        };
    }

    const apparel = apparelSignals.find((signal) => signal.pattern.test(normalized));
    const seasonal = seasonalSignals.find((signal) => signal.pattern.test(normalized));
    const intent = intentSignals.find((signal) => signal.pattern.test(normalized));

    if (!apparel && !seasonal && !intent) {
        return {
            isMerchRelevant: false,
            merchReason: 'none',
        };
    }

    if (!seasonal && !intent && isShortGenericApparelTerm(normalized)) {
        return {
            isMerchRelevant: false,
            merchReason: 'blocked:generic-apparel',
        };
    }

    if (!seasonal && !intent && isColorGenderGenericApparelTerm(normalized)) {
        return {
            isMerchRelevant: false,
            merchReason: 'blocked:color-gender-generic',
        };
    }

    const reasons: string[] = [];
    if (seasonal) {
        reasons.push(`seasonal:${seasonal.key}`);
    }
    if (intent) {
        reasons.push(`intent:${intent.key}`);
    }
    reasons.push('category:apparel');

    return {
        isMerchRelevant: true,
        merchReason: reasons.join('+'),
    };
};

export const createBaKeywordAccumulator = () => {
    return new Map<string, BaKeywordAccumulator>();
};

export const addBaKeywordRowToAccumulator = (
    accumulator: Map<string, BaKeywordAccumulator>,
    row: RawBaSearchTermsRow
) => {
    const rawTerm = typeof row.searchTerm === 'string' ? row.searchTerm.trim() : '';
    if (!rawTerm) {
        return;
    }

    const classification = classifyMerchKeyword(rawTerm, extractTopClickedCategories(row));
    if (!classification.isMerchRelevant) {
        return;
    }

    const rank = toInteger(row.searchFrequencyRank);
    if (rank === null) {
        return;
    }

    const normalizedTerm = normalizeSearchTerm(rawTerm);
    const existing = accumulator.get(normalizedTerm);

    if (!existing) {
        accumulator.set(normalizedTerm, {
            searchTerm: rawTerm,
            searchFrequencyRank: rank,
            clickShareTop3Sum: toNumber(row.clickShare),
            conversionShareTop3Sum: toNumber(row.conversionShare),
            topRowsCount: 1,
            merchReason: classification.merchReason,
        });
        return;
    }

    existing.searchFrequencyRank = Math.min(existing.searchFrequencyRank, rank);
    existing.clickShareTop3Sum += toNumber(row.clickShare);
    existing.conversionShareTop3Sum += toNumber(row.conversionShare);
    existing.topRowsCount += 1;
};

export const finalizeBaKeywordAccumulator = (accumulator: Map<string, BaKeywordAccumulator>) => {
    return [...accumulator.values()]
        .map((row) => ({
            clickShareTop3Sum: round4(row.clickShareTop3Sum),
            conversionShareTop3Sum: round4(row.conversionShareTop3Sum),
            isMerchRelevant: true,
            merchReason: row.merchReason,
            searchFrequencyRank: row.searchFrequencyRank,
            searchTerm: row.searchTerm,
            topRowsCount: row.topRowsCount,
        }))
        .sort(
            (a, b) =>
                a.searchFrequencyRank - b.searchFrequencyRank || a.searchTerm.localeCompare(b.searchTerm)
        );
};

export const aggregateBaKeywordRows = (rows: RawBaSearchTermsRow[]) => {
    const accumulator = createBaKeywordAccumulator();

    for (const row of rows) {
        addBaKeywordRowToAccumulator(accumulator, row);
    }

    return finalizeBaKeywordAccumulator(accumulator);
};

const normalizeSearchTerm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const extractTopClickedCategories = (row: RawBaSearchTermsRow) => {
    const indexedTopCategories = new Set<string>();
    const fallbackCategories = new Set<string>();
    let sawIndexedTopClickedCategory = false;

    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeObjectKey(key);
        if (!normalizedKey.includes('topclicked') || !normalizedKey.includes('categor')) {
            continue;
        }

        const categoriesFromField = extractCategoriesFromFieldValue(value);
        if (categoriesFromField.length === 0) {
            continue;
        }

        const slot = extractTopClickedCategorySlot(normalizedKey);
        if (slot !== null) {
            sawIndexedTopClickedCategory = true;
            if (slot <= 2) {
                for (const category of categoriesFromField) {
                    indexedTopCategories.add(category);
                }
            }
            continue;
        }

        for (const category of categoriesFromField) {
            fallbackCategories.add(category);
        }
    }

    if (indexedTopCategories.size > 0 || sawIndexedTopClickedCategory) {
        return [...indexedTopCategories];
    }

    if (row.topClickedCategories) {
        for (const category of extractCategoriesFromFieldValue(row.topClickedCategories)) {
            fallbackCategories.add(category);
        }
    }

    return [...fallbackCategories];
};

const extractCategoriesFromFieldValue = (value: unknown) => {
    if (typeof value === 'string') {
        return value
            .split(',')
            .map(normalizeSearchTerm)
            .filter(Boolean);
    }

    if (Array.isArray(value)) {
        const categories: string[] = [];
        for (const item of value) {
            if (typeof item !== 'string') {
                continue;
            }
            for (const category of item.split(',')) {
                const normalized = normalizeSearchTerm(category);
                if (normalized) {
                    categories.push(normalized);
                }
            }
        }
        return categories;
    }

    return [];
};

const extractTopClickedCategorySlot = (normalizedKey: string) => {
    const match = normalizedKey.match(/topclickedcategor(?:y|ies)(\d+)/);
    if (!match) {
        return null;
    }

    const parsedSlot = Number(match[1]);
    return Number.isFinite(parsedSlot) && parsedSlot > 0 ? parsedSlot : null;
};

const normalizeObjectKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const toInteger = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    return Math.floor(numeric);
};

const toNumber = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const round4 = (value: number) => Number(value.toFixed(4));
