/**
 * Amazon Root Category IDs
 *
 * Mapping from Amazon display group names (as returned by SP-API) to root category IDs.
 * Source: https://gist.github.com/AnalyzePlatypus/2dadd9645f60d106f154d8f34b35df00
 */

export type AmazonRootCategoryId =
    | 5174 // CDs & Vinyl
    | 172282 // Electronics
    | 228013 // Tools & Home Improvement
    | 229534 // Software
    | 283155 // Books
    | 468642 // Video Games
    | 599858 // Magazine Subscriptions
    | 1055398 // Home & Kitchen
    | 1064954 // Office Products
    | 3375251 // Sports & Outdoors
    | 3760901 // Health & Household
    | 3760911 // Beauty & Personal Care
    | 10272111 // Everything Else
    | 11091801 // Musical Instruments
    | 15684181 // Automotive
    | 16310091 // Industrial & Scientific
    | 16310101 // Grocery & Gourmet Food
    | 133140011 // Kindle Store
    | 163856011 // Digital Music
    | 165793011 // Toys & Games
    | 165796011 // Baby Products
    | 2335752011 // Cell Phones & Accessories
    | 2350149011 // Apps & Games
    | 2617941011 // Arts, Crafts & Sewing
    | 2619525011 // Appliances
    | 2619533011 // Pet Supplies
    | 2625373011 // Movies & TV
    | 2972638011 // Patio, Lawn & Garden
    | 9013971011 // Video Shorts
    | 13727921011 // Alexa Skills
    | 11260432011 // Handmade Products
    | 7141123011 // Clothing, Shoes & Jewelry
    | 4991425011 // Collectibles & Fine Art
    | 10677469011 // Vehicles
    | 18145289011; // Audible Books & Originals

/**
 * Mapping from display group names (as returned by SP-API) to root category IDs.
 *
 * Note: Display group names may vary slightly in formatting. This mapping uses
 * the exact names as they appear in the Amazon root categories list.
 */
export const DISPLAY_GROUP_TO_ROOT_CATEGORY_ID: Record<string, AmazonRootCategoryId> = {
    'CDs & Vinyl': 5174,
    Electronics: 172282,
    'Tools & Home Improvement': 228013,
    Software: 229534,
    Books: 283155,
    'Video Games': 468642,
    'Magazine Subscriptions': 599858,
    'Home & Kitchen': 1055398,
    'Office Products': 1064954,
    'Sports & Outdoors': 3375251,
    'Health & Household': 3760901,
    'Health, Household & Baby Care': 3760901, // Alternative name
    'Beauty & Personal Care': 3760911,
    'Everything Else': 10272111,
    'Musical Instruments': 11091801,
    Automotive: 15684181,
    'Industrial & Scientific': 16310091,
    'Grocery & Gourmet Food': 16310101,
    'Kindle Store': 133140011,
    'Digital Music': 163856011,
    'Toys & Games': 165793011,
    'Baby Products': 165796011,
    'Cell Phones & Accessories': 2335752011,
    'Apps & Games': 2350149011,
    'Arts, Crafts & Sewing': 2617941011,
    Appliances: 2619525011,
    'Pet Supplies': 2619533011,
    'Movies & TV': 2625373011,
    'Patio, Lawn & Garden': 2972638011,
    'Video Shorts': 9013971011,
    'Alexa Skills': 13727921011,
    'Handmade Products': 11260432011,
    'Clothing, Shoes & Jewelry': 7141123011,
    'Collectibles & Fine Art': 4991425011,
    Vehicles: 10677469011,
    'Audible Books & Originals': 18145289011,
};

/**
 * Reverse mapping from root category ID to display group name.
 * Uses the first (canonical) name for each ID.
 */
const ROOT_CATEGORY_ID_TO_DISPLAY_GROUP: Record<AmazonRootCategoryId, string> = {
    5174: 'CDs & Vinyl',
    172282: 'Electronics',
    228013: 'Tools & Home Improvement',
    229534: 'Software',
    283155: 'Books',
    468642: 'Video Games',
    599858: 'Magazine Subscriptions',
    1055398: 'Home & Kitchen',
    1064954: 'Office Products',
    3375251: 'Sports & Outdoors',
    3760901: 'Health & Household',
    3760911: 'Beauty & Personal Care',
    10272111: 'Everything Else',
    11091801: 'Musical Instruments',
    15684181: 'Automotive',
    16310091: 'Industrial & Scientific',
    16310101: 'Grocery & Gourmet Food',
    133140011: 'Kindle Store',
    163856011: 'Digital Music',
    165793011: 'Toys & Games',
    165796011: 'Baby Products',
    2335752011: 'Cell Phones & Accessories',
    2350149011: 'Apps & Games',
    2617941011: 'Arts, Crafts & Sewing',
    2619525011: 'Appliances',
    2619533011: 'Pet Supplies',
    2625373011: 'Movies & TV',
    2972638011: 'Patio, Lawn & Garden',
    9013971011: 'Video Shorts',
    13727921011: 'Alexa Skills',
    11260432011: 'Handmade Products',
    7141123011: 'Clothing, Shoes & Jewelry',
    4991425011: 'Collectibles & Fine Art',
    10677469011: 'Vehicles',
    18145289011: 'Audible Books & Originals',
};

/**
 * Get the root category ID for a given display group name.
 * Returns undefined if no mapping is found.
 */
export function getRootCategoryId(displayGroupName: string): AmazonRootCategoryId | undefined {
    return DISPLAY_GROUP_TO_ROOT_CATEGORY_ID[displayGroupName];
}

/**
 * Get the display group name for a given root category ID.
 * Returns undefined if no mapping is found.
 */
export function getDisplayGroupName(rootCategoryId: AmazonRootCategoryId): string | undefined {
    return ROOT_CATEGORY_ID_TO_DISPLAY_GROUP[rootCategoryId];
}
