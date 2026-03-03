import {
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

export const classifyMerchKeyword = (searchTerm: string) => {
    const normalized = normalizeSearchTerm(searchTerm);

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
    if (reasons.length === 0) {
        reasons.push('signal:apparel');
    }

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
    row: RawBaSearchTermsRow,
    debugStats?: {
        acceptedTopRows: number;
        emptySearchTermRows: number;
        invalidRankRows: number;
        rejectedByReason: Record<string, number>;
    }
) => {
    const rawTerm = typeof row.searchTerm === 'string' ? row.searchTerm.trim() : '';
    if (!rawTerm) {
        if (debugStats) {
            debugStats.emptySearchTermRows += 1;
        }
        return;
    }

    const classification = classifyMerchKeyword(rawTerm);
    if (!classification.isMerchRelevant) {
        if (debugStats) {
            debugStats.rejectedByReason[classification.merchReason] =
                (debugStats.rejectedByReason[classification.merchReason] ?? 0) + 1;
        }
        return;
    }

    const rank = toInteger(row.searchFrequencyRank);
    if (rank === null) {
        if (debugStats) {
            debugStats.invalidRankRows += 1;
        }
        return;
    }

    if (debugStats) {
        debugStats.acceptedTopRows += 1;
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
