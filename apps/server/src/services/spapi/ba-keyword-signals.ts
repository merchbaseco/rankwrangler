type KeywordSignal = {
    key: string;
    pattern: RegExp;
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

export const apparelCategorySignals: KeywordSignal[] = [
    { key: 'apparel', pattern: /\bapparel\b/i },
    { key: 'clothing', pattern: /\bclothing\b/i },
    { key: 'softlines', pattern: /\bsoftlines?\b/i },
    { key: 'fashion', pattern: /\bfashion\b/i },
    { key: 'tshirt', pattern: /\bt[\s-]?shirts?\b/i },
    { key: 'tee', pattern: /\btees?\b/i },
    { key: 'hoodie', pattern: /\bhoodies?\b/i },
    { key: 'sweatshirt', pattern: /\bsweatshirts?\b/i },
    { key: 'crewneck', pattern: /\bcrewnecks?\b/i },
    { key: 'tank top', pattern: /\btank[\s-]?tops?\b/i },
    { key: 'tops', pattern: /\btops?\b/i },
] as const;

export const nonPodCommoditySignals: KeywordSignal[] = [
    {
        key: 'material-percent',
        pattern:
            /\b(?:\d{1,3}\s*%|100\s*percent)\s*(?:cotton|polyester|poly|spandex|elastane|rayon|viscose|linen|wool|nylon|acrylic)\b/i,
    },
    { key: 'heather-material', pattern: /\bheathers?\b/i },
    { key: 'classic-fit', pattern: /\bclassic\s+fit\b/i },
    { key: 'double-needle', pattern: /\bdouble-needle\b/i },
    { key: 'twill-taped-neck', pattern: /\btwill-?taped\s+neck\b/i },
    { key: 'machine-wash', pattern: /\bmachine\s+wash(?:\s+cold)?\b/i },
    { key: 'spun-polyester', pattern: /\bspun-?polyester\s+fabric\b/i },
    { key: 'protective-case', pattern: /\bprotective\s+case\b/i },
    { key: 'polycarbonate-shell', pattern: /\bpolycarbonate\s+(?:shell|case)\b/i },
    { key: 'dual-wall-insulated', pattern: /\bdual\s+wall\s+insulated\b/i },
    { key: '11-ounce-mug', pattern: /\b11-?ounce\s+ceramic\s+mug\b/i },
    {
        key: 'cotton-basic',
        pattern:
            /\bcotton\s+(?:underwear|briefs?|boxers?|pant(?:y|ies)|thongs?|socks?|leggings|bikini|bra)\b/i,
    },
    { key: 'button-down-up', pattern: /\bbutton\s*(?:down|up)\b/i },
    { key: 'dress-shirt', pattern: /\bdress\s+shirt\b/i },
    { key: 'compression', pattern: /\bcompression\b/i },
    { key: 'underscrub', pattern: /\b(?:underscrub|under\s+scrubs?)\b/i },
    { key: 'quarter-zip', pattern: /\b(?:quarter\s*zip|1\/4\s*zip)\b/i },
    { key: 'zip-up', pattern: /\bzip\s*up\b/i },
    { key: 'swim-shirt', pattern: /\bswim\s+shirt\b/i },
    { key: 'polo-shirt', pattern: /\bpolo\s+shirt\b/i },
    { key: 'shirt-stays', pattern: /\bshirt\s+stays?\b/i },
    { key: 'undershirt', pattern: /\bundershirt\b/i },
    { key: 'bodysuit', pattern: /\bbodysuits?\b/i },
    { key: 'maxi-dress', pattern: /\bmaxi\s+dress\b/i },
    { key: 'mini-dress', pattern: /\bmini\s+dress\b/i },
    { key: 'shirt-dress', pattern: /\bshirt\s+dress(?:es)?\b/i },
    { key: 'workout-athletic', pattern: /\b(?:workout|athletic)\b/i },
    { key: 'golf-shirt', pattern: /\bgolf\s+shirt\b/i },
    { key: 'spaghetti-strap', pattern: /\bspaghetti\s+strap\b/i },
    { key: 'going-out-tops', pattern: /\bgoing\s+out\s+tops?\b/i },
    { key: 'flannel', pattern: /\bflannel\b/i },
    { key: 'denim', pattern: /\bdenim\b/i },
    { key: 'linen', pattern: /\blinen\b/i },
] as const;

export const nonPodBrandOrIpSignals: KeywordSignal[] = [
    {
        key: 'brand-or-ip',
        pattern:
            /\b(?:nike|adidas|under\s+armou?r|carhartt|gildan|hanes|champion|comfort\s+colors|bella\s+canvas|gap|essentials|comfrt|white\s+fox|aelfric\s+eden|bape|sp5der|into\s+the\s+am|life\s+is\s+good|bad\s+bunny|benito\s+bowl|taylor\s+swift|trump|disney|dr\s+seuss|cat\s+in\s+the\s+hat|stranger\s+things|ghostface|seahawks|patriots|super\s+bowl|olympic|monster\s+jam|nfl|nba|mlb|nhl)\b/i,
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
