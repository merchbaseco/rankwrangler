type KeywordSignal = {
    key: string;
    pattern: RegExp;
};

export type CommodityBlockScope = 'always' | 'no-apparel-signal';

export type CommodityKeywordSignal = KeywordSignal & {
    scope: CommodityBlockScope;
};

export const apparelSignals: KeywordSignal[] = [
    { key: 'tshirt', pattern: /\bt[\s-]?shirt\b/i },
    { key: 'shirt', pattern: /\bshirt\b/i },
    { key: 'tee', pattern: /\btee\b/i },
    { key: 'hoodie', pattern: /\bhoodie\b/i },
    { key: 'sweatshirt', pattern: /\bsweatshirt\b/i },
    { key: 'crewneck', pattern: /\bcrewneck\b/i },
    { key: 'tank top', pattern: /\btank[\s-]?top\b/i },
    { key: 'long sleeve', pattern: /\blong[\s-]?sleeve\b/i },
    { key: 'pullover', pattern: /\bpullover\b/i },
    { key: 'v neck', pattern: /\bv[\s-]?neck\b/i },
    { key: 'raglan', pattern: /\braglan\b/i },
    { key: 'tote bag', pattern: /\btote\s+bag\b/i },
    { key: 'popsocket', pattern: /\bpop[\s-]?socket(?:s)?\b/i },
    { key: 'popgrip', pattern: /\bpopgrip\b/i },
    { key: 'phone case', pattern: /\b(?:phone|iphone|samsung|galaxy)\s+case\b/i },
    { key: 'throw pillow', pattern: /\bthrow\s+pillow\b/i },
    { key: 'tumbler', pattern: /\btumbler\b/i },
    { key: 'mug', pattern: /\b(?:ceramic\s+)?mug\b/i },
    { key: 'apparel', pattern: /\bapparel\b/i },
] as const;

export const seasonalSignals: KeywordSignal[] = [
    { key: 'st patrick', pattern: /\bst\.?\s+patrick'?s?\b/i },
    { key: 'valentine', pattern: /\bvalentine'?s?\b/i },
    { key: 'easter', pattern: /\beaster\b/i },
    { key: 'halloween', pattern: /\bhalloween\b/i },
    { key: 'christmas', pattern: /\bchristmas\b/i },
    { key: 'fathers day', pattern: /\bfather'?s\s+day\b/i },
    { key: 'mothers day', pattern: /\bmother'?s\s+day\b/i },
    { key: 'mardi gras', pattern: /\bmardi\s+gras\b/i },
] as const;

export const intentSignals: KeywordSignal[] = [
    { key: 'gift', pattern: /\bgifts?\b/i },
    { key: 'school', pattern: /\bschool\b/i },
] as const;

const nonPodMaterialAndListingSignals: CommodityKeywordSignal[] = [
    {
        key: 'material-percent',
        scope: 'always',
        pattern:
            /\b(?:\d{1,3}\s*%|100\s*percent)\s*(?:cotton|polyester|poly|spandex|elastane|rayon|viscose|linen|wool|nylon|acrylic)\b/i,
    },
    { key: 'heather-material', scope: 'always', pattern: /\bheathers?\b/i },
    { key: 'classic-fit', scope: 'always', pattern: /\bclassic\s+fit\b/i },
    { key: 'double-needle', scope: 'always', pattern: /\bdouble-needle\b/i },
    { key: 'twill-taped-neck', scope: 'always', pattern: /\btwill-?taped\s+neck\b/i },
    { key: 'machine-wash', scope: 'always', pattern: /\bmachine\s+wash(?:\s+cold)?\b/i },
    { key: 'spun-polyester', scope: 'always', pattern: /\bspun-?polyester\s+fabric\b/i },
    { key: 'protective-case', scope: 'always', pattern: /\bprotective\s+case\b/i },
    { key: 'polycarbonate-shell', scope: 'always', pattern: /\bpolycarbonate\s+(?:shell|case)\b/i },
    { key: 'dual-wall-insulated', scope: 'always', pattern: /\bdual\s+wall\s+insulated\b/i },
    { key: '11-ounce-mug', scope: 'always', pattern: /\b11-?ounce\s+ceramic\s+mug\b/i },
    {
        key: 'cotton-basic',
        scope: 'always',
        pattern:
            /\bcotton\s+(?:underwear|briefs?|boxers?|pant(?:y|ies)|thongs?|socks?|leggings|bikini|bra)\b/i,
    },
    { key: 'button-down-up', scope: 'always', pattern: /\bbutton\s*(?:down|up)\b/i },
    { key: 'dress-shirt', scope: 'always', pattern: /\bdress\s+shirt\b/i },
    { key: 'compression', scope: 'always', pattern: /\bcompression\b/i },
    { key: 'underscrub', scope: 'always', pattern: /\b(?:underscrub|under\s+scrubs?)\b/i },
    { key: 'quarter-zip', scope: 'always', pattern: /\b(?:quarter\s*zip|1\/4\s*zip)\b/i },
    { key: 'zip-up', scope: 'always', pattern: /\bzip\s*up\b/i },
    { key: 'swim-shirt', scope: 'always', pattern: /\bswim\s+shirt\b/i },
    { key: 'polo-shirt', scope: 'always', pattern: /\bpolo\s+shirt\b/i },
    { key: 'shirt-stays', scope: 'always', pattern: /\bshirt\s+stays?\b/i },
    { key: 'undershirt', scope: 'always', pattern: /\bundershirt\b/i },
    { key: 'bodysuit', scope: 'always', pattern: /\bbodysuits?\b/i },
    { key: 'maxi-dress', scope: 'always', pattern: /\bmaxi\s+dress\b/i },
    { key: 'mini-dress', scope: 'always', pattern: /\bmini\s+dress\b/i },
    { key: 'shirt-dress', scope: 'always', pattern: /\bshirt\s+dress(?:es)?\b/i },
    { key: 'workout-athletic', scope: 'always', pattern: /\b(?:workout|athletic)\b/i },
    { key: 'golf-shirt', scope: 'always', pattern: /\bgolf\s+shirt\b/i },
    { key: 'spaghetti-strap', scope: 'always', pattern: /\bspaghetti\s+strap\b/i },
    { key: 'going-out-tops', scope: 'always', pattern: /\bgoing\s+out\s+tops?\b/i },
    { key: 'flannel', scope: 'always', pattern: /\bflannel\b/i },
    { key: 'denim', scope: 'always', pattern: /\bdenim\b/i },
    { key: 'linen', scope: 'always', pattern: /\blinen\b/i },
] as const;

// Stored-value and digital delivery terms are never useful for PoD targeting.
const nonPodStoredValueSignals: CommodityKeywordSignal[] = [
    {
        key: 'gift-card',
        scope: 'always',
        pattern: /\bgift\s*cards?\b/i,
    },
    {
        key: 'e-card',
        scope: 'always',
        pattern: /\b(?:e-?cards?|ecards?)\b/i,
    },
    {
        key: 'digital-code',
        scope: 'always',
        pattern: /\bdigital\s+code\b/i,
    },
] as const;

// These terms are mostly non-PoD seasonal consumables/decor unless paired with a strong product signal.
const nonPodSeasonalMerchandiseSignals: CommodityKeywordSignal[] = [
    {
        key: 'greeting-card',
        scope: 'no-apparel-signal',
        pattern: /\bcards?\b$|\bcards?\s+for\b/i,
    },
    {
        key: 'seasonal-decor',
        scope: 'no-apparel-signal',
        pattern:
            /\bdecor(?:ation|ations)?\b|\bgarland\b|\bwreath\b|\btable\s+runner\b|\bbeads\b|\bballoons?\b/i,
    },
    {
        key: 'seasonal-candy',
        scope: 'no-apparel-signal',
        pattern: /\bcandy\b|\bchocolate\b|\bsprinkles?\b/i,
    },
    {
        key: 'seasonal-basket',
        scope: 'no-apparel-signal',
        pattern: /\bbaskets?\b|\bbasket\s+stuffers?\b|\begg\s+fillers?\b|\bprefilled\s+eggs?\b/i,
    },
    {
        key: 'party-favors',
        scope: 'no-apparel-signal',
        pattern: /\bparty\s+favors?\b/i,
    },
    {
        key: 'wrapping-paper',
        scope: 'no-apparel-signal',
        pattern: /\bwrapping\s+paper\b/i,
    },
    {
        key: 'gift-packaging',
        scope: 'no-apparel-signal',
        pattern: /\bgift\s+bags?\b|\bgift\s+boxes?\b/i,
    },
    {
        key: 'seasonal-dress',
        scope: 'no-apparel-signal',
        pattern: /\bdresses?\b/i,
    },
    {
        key: 'seasonal-lingerie',
        scope: 'no-apparel-signal',
        pattern: /\blingerie\b/i,
    },
    {
        key: 'seasonal-jewelry-beauty',
        scope: 'no-apparel-signal',
        pattern: /\bearrings?\b|\bnails?\b|\bheadbands?\b|\bsocks?\b/i,
    },
    {
        key: 'seasonal-party-supply',
        scope: 'no-apparel-signal',
        pattern: /\btablecloth\b|\bplates?\b|\bnapkins?\b|\bbackdrop\b|\bribbon\b/i,
    },
    {
        key: 'seasonal-toy-plush',
        scope: 'no-apparel-signal',
        pattern: /\btoys?\b|\bplush\b/i,
    },
] as const;

export const nonPodCommoditySignals: CommodityKeywordSignal[] = [
    ...nonPodMaterialAndListingSignals,
    ...nonPodStoredValueSignals,
    ...nonPodSeasonalMerchandiseSignals,
] as const;

export const nonPodBrandOrIpSignals: KeywordSignal[] = [
    {
        key: 'brand-or-ip',
        pattern:
            /\b(?:nike|adidas|under\s+armou?r|carhartt|gildan|hanes|champion|comfort\s+colors|bella\s+canvas|gap|essentials|comfrt|white\s+fox|aelfric\s+eden|bape|sp5der|into\s+the\s+am|life\s+is\s+good|bad\s+bunny|benito\s+bowl|taylor\s+swift|trump|disney|dr\s+seuss|cat\s+in\s+the\s+hat|stranger\s+things|ghostface|seahawks|patriots|super\s+bowl|olympic|monster\s+jam|nfl|nba|mlb|nhl|yeti|owala|lego|minecraft|pokemon|needoh)\b/i,
    },
] as const;

export const colorSignals: KeywordSignal[] = [
    {
        key: 'color',
        pattern:
            /\b(?:black|white|blue|red|pink|green|yellow|purple|brown|beige|grey|gray|navy)\b/i,
    },
] as const;

export const genderSignals: KeywordSignal[] = [
    { key: 'gender', pattern: /\b(?:men|mens|man|women|womens|woman|girls|boys)\b/i },
] as const;

export const genericApparelSignals: KeywordSignal[] = [
    {
        key: 'generic-apparel',
        pattern:
            /\b(?:t[\s-]?shirts?|shirts?|hoodies?|sweatshirts?|tank[\s-]?tops?|tees?|crewnecks?|pullovers?|long[\s-]?sleeves?|apparel)\b/i,
    },
] as const;
