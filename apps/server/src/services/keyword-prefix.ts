// Deterministic keyword prefixes. A prefix broadens a keyword by dropping the Merch product it
// names and its audience or filler words: "funny pickleball dad shirts for women" and "pickleball
// dad mug" share the prefix "pickleball dad". Autocomplete expands a prefix back out to other Merch
// product types, and a Merch-proven prefix vouches for searches of it on them, which title rules
// cannot do.

export type MerchProductKind =
    | 'apparel'
    | 'headwear'
    | 'bag'
    | 'phoneAccessory'
    | 'home'
    | 'drinkware'
    | 'stationery';

// Product names for all 41 Merch on Demand product types, with plurals and common synonyms. Each
// phrase is matched as whole words after normalization (hyphens become spaces, so "t-shirt" is
// "t shirt" and "1/4 zip" becomes "quarter zip").
export const MERCH_PRODUCT_PHRASES: Readonly<Record<MerchProductKind, readonly string[]>> = {
    apparel: [
        ...plural('shirt', 't shirt', 'tshirt', 'tee shirt', 'tee', 'tank', 'tank top', 'top'),
        ...plural('crop top', 'raglan', 'jersey', 'sweatshirt', 'crewneck', 'crew neck', 'v neck'),
        ...plural('hoodie', 'pullover', 'polo', 'polo shirt', 'quarter zip', 'jacket'),
        ...plural('quarter zip pullover', 'zip up hoodie'),
        ...plural('long sleeve', 'long sleeve shirt', 'long sleeve t shirt', 'pullover hoodie'),
        ...plural('zip hoodie', 'baseball jersey', 'soccer jersey'),
        ...plural('basketball jersey', 'softshell jacket', 'crop sweatshirt'),
        'hoody',
        'zip up',
        'zip',
    ],
    headwear: [
        ...plural('hat', 'cap', 'baseball cap', 'baseball hat', 'trucker hat', 'dad hat'),
        ...plural('snapback', 'visor', 'sun visor'),
    ],
    bag: [
        ...plural('backpack', 'tote', 'tote bag', 'bag', 'crossbody', 'crossbody bag'),
        ...plural('cross body bag', 'laptop sleeve', 'laptop case'),
    ],
    phoneAccessory: [
        ...plural('popsocket', 'pop socket', 'popgrip', 'pop grip', 'phone grip'),
        ...plural('phone case', 'iphone case', 'case'),
    ],
    home: [
        ...plural('mouse pad', 'mousepad', 'pillow', 'throw pillow', 'pillow case', 'pillow cover'),
        ...plural('throw pillow cover', 'blanket', 'throw blanket', 'throw', 'poster'),
    ],
    drinkware: [
        ...plural('tumbler', 'travel tumbler', 'mug', 'coffee mug', 'travel mug', 'cup'),
        ...plural('coffee cup', 'water bottle', 'bottle'),
    ],
    stationery: plural('journal', 'notebook', 'pen'),
};

// Audience and filler words dropped from either end of a term. Style words such as "vintage" and
// "retro" stay: they are part of what a design is about.
export const PREFIX_FILLER_WORDS: ReadonlySet<string> = new Set([
    'a',
    'an',
    'and',
    'of',
    'the',
    'to',
    'for',
    'with',
    'women',
    'womens',
    "women's",
    'men',
    'mens',
    "men's",
    'ladies',
    'kids',
    'kid',
    "kid's",
    'boys',
    "boy's",
    'girls',
    "girl's",
    'toddler',
    'toddlers',
    'youth',
    'adult',
    'adults',
    'unisex',
    'funny',
    'cute',
    'cool',
    'gift',
    'gifts',
    'idea',
    'ideas',
    'novelty',
    'graphic',
]);

// The prefix of a search, or null when nothing meaningful remains. Trailing filler is dropped, then
// at most one product phrase at the end (longest first), then filler at either end. A product word
// inside the prefix survives ("hat trick hockey shirt" is "hat trick hockey").
export const extractKeywordPrefix = (term: string) => parseTerm(term).prefix;

// Which Merch product type the search text itself names, judged by the product phrase at its end
// once trailing filler is dropped ("teacher shirts for women" names apparel), or null.
export const merchProductTermKind = (term: string) => parseTerm(term).kind;

// Whether a prefix is the seed prefix or contains it as whole words ("teacher life" contains
// "teacher", "teachers" does not).
export const prefixContains = (prefix: string, seed: string) => ` ${prefix} `.includes(` ${seed} `);

// Autocomplete suggestions for a prefix worth trying as keywords: each names a Merch product and
// keeps the seed prefix.
export const prefixTrialTerms = (seed: string, suggestions: readonly string[]) =>
    suggestions.filter(suggestion => {
        const parsed = parseTerm(suggestion);
        return (
            parsed.kind !== null && parsed.prefix !== null && prefixContains(parsed.prefix, seed)
        );
    });

type Phrase = { tokens: readonly string[]; kind: MerchProductKind };

const phrases: readonly Phrase[] = Object.entries(MERCH_PRODUCT_PHRASES)
    .flatMap(([kind, list]) =>
        list.map(phrase => ({ tokens: phrase.split(' '), kind: kind as MerchProductKind }))
    )
    .sort((a, b) => b.tokens.length - a.tokens.length);
const phraseKeys: ReadonlySet<string> = new Set(phrases.map(phrase => phrase.tokens.join(' ')));

const parseTerm = (term: string) => {
    const tokens = normalizeTokens(term);
    dropTrailingFiller(tokens);
    const product = phrases.find(phrase => endsWith(tokens, phrase.tokens)) ?? null;
    if (product) tokens.splice(tokens.length - product.tokens.length);
    dropTrailingFiller(tokens);
    while (tokens.length && PREFIX_FILLER_WORDS.has(tokens[0])) tokens.shift();
    const prefix = tokens.join(' ');
    return {
        kind: product?.kind ?? null,
        prefix: prefix.length < 2 || phraseKeys.has(prefix) ? null : prefix,
    };
};

const normalizeTokens = (term: string) =>
    term
        .toLowerCase()
        .replace(/[‘’]/gu, "'")
        .replace(/(^|\s)1\/4(?=\s|-|$)/gu, '$1quarter')
        .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
        .split(/\s+/u)
        .map(token => token.replace(/^'+|'+$/gu, ''))
        .filter(Boolean);

const dropTrailingFiller = (tokens: string[]) => {
    while (tokens.length && PREFIX_FILLER_WORDS.has(tokens[tokens.length - 1])) tokens.pop();
};

const endsWith = (tokens: readonly string[], suffix: readonly string[]) =>
    suffix.length <= tokens.length &&
    suffix.every((token, index) => tokens[tokens.length - suffix.length + index] === token);

function plural(...words: string[]) {
    return words.flatMap(word => [word, `${word}s`]);
}
