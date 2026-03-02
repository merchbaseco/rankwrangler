export type RawBaSearchTermsRow = {
    searchTerm?: string;
    searchFrequencyRank?: number;
    clickShare?: number;
    conversionShare?: number;
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

const apparelSignals = [
    { key: 'tshirt', pattern: /\bt[\s-]?shirt\b/i },
    { key: 'shirt', pattern: /\bshirt\b/i },
    { key: 'tee', pattern: /\btee\b/i },
    { key: 'hoodie', pattern: /\bhoodie\b/i },
    { key: 'sweatshirt', pattern: /\bsweatshirt\b/i },
    { key: 'crewneck', pattern: /\bcrewneck\b/i },
    { key: 'tank top', pattern: /\btank\s+top\b/i },
    { key: 'long sleeve', pattern: /\blong\s+sleeve\b/i },
    { key: 'pullover', pattern: /\bpullover\b/i },
    { key: 'apparel', pattern: /\bapparel\b/i },
] as const;

const seasonalSignals = [
    { key: 'st patrick', pattern: /\bst\.?\s+patrick'?s?\b/i },
    { key: 'valentine', pattern: /\bvalentine'?s?\b/i },
    { key: 'easter', pattern: /\beaster\b/i },
    { key: 'halloween', pattern: /\bhalloween\b/i },
    { key: 'christmas', pattern: /\bchristmas\b/i },
    { key: 'fathers day', pattern: /\bfather'?s\s+day\b/i },
    { key: 'mothers day', pattern: /\bmother'?s\s+day\b/i },
    { key: 'mardi gras', pattern: /\bmardi\s+gras\b/i },
] as const;

export const classifyMerchKeyword = (searchTerm: string) => {
    const normalized = normalizeSearchTerm(searchTerm);
    const apparel = apparelSignals.find((signal) => signal.pattern.test(normalized));

    if (!apparel) {
        return {
            isMerchRelevant: false,
            merchReason: 'none',
        };
    }

    const seasonal = seasonalSignals.find((signal) => signal.pattern.test(normalized));

    return {
        isMerchRelevant: true,
        merchReason: seasonal
            ? `seasonal:${seasonal.key}+apparel:${apparel.key}`
            : `apparel:${apparel.key}`,
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

    const classification = classifyMerchKeyword(rawTerm);
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
