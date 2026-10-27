import { KEYWORD_ACCEPT_PROBABILITY } from './keyword-judgment-contract';

// Default roots per mined product. Already-tracked phrases use slots too, and a product with fewer
// good distinct phrases selects fewer rather than padding.
export const PRODUCT_KEYWORD_SELECTION_LIMIT = 5;

type Candidate = {
    candidateId: string;
    term: string;
    verdict: 'accepted' | 'rejected' | null;
    relevance: number | null;
};

// Rows arrive in Ads recommendation order. Keep the earliest phrase for each distinct topic.
export const selectProductKeywords = (
    rows: readonly Candidate[],
    limit = PRODUCT_KEYWORD_SELECTION_LIMIT
) => {
    const seen = new Set<string>();
    const selected: string[] = [];
    for (const row of rows) {
        if (selected.length >= limit) break;
        if (row.verdict !== 'accepted' || (row.relevance ?? 0) < KEYWORD_ACCEPT_PROBABILITY)
            continue;
        const key = topicSignature(row.term);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        selected.push(row.candidateId);
    }
    return selected;
};

// Collapses apparel words, filler and word order: "funny bigfoot t-shirt" and "bigfoot shirt"
// share a slot, "bigfoot christmas shirt" does not. Selection only; keyword identity stays exact.
export const topicSignature = (term: string) =>
    [
        ...new Set(
            term
                .toLowerCase()
                .replaceAll('t-shirt', 'tshirt')
                .match(/[a-z0-9]+/gu)
                ?.map(word => (word === 'christma' ? 'christmas' : word))
                .filter(word => !fillerWords.has(word)) ?? []
        ),
    ]
        .sort()
        .join(' ');

const fillerWords = new Set(
    'a an the for with and of to on in t shirt shirts tshirt tshirts tee tees sweatshirt sweatshirts hoodie hoodies apparel clothing graphic graphics funny cute cool novelty gift gifts design designs'.split(
        ' '
    )
);
