/**
 * Word pools for the synthetic catalog. Merch-on-Demand listings are built from
 * an audience plus a sentiment plus a garment, so titles generated the same way
 * read like the real thing and classify the same way under the shipped
 * Merch-listing and keyword heuristics.
 */

export interface SeedAudience {
    readonly facet: string;
    readonly name: string;
    readonly nouns: readonly string[];
}

export const SEED_AUDIENCES: readonly SeedAudience[] = [
    { facet: 'profession', name: 'nurse', nouns: ['Nurse', 'ER Nurse', 'Night Shift Nurse'] },
    { facet: 'profession', name: 'teacher', nouns: ['Teacher', 'Kindergarten Teacher'] },
    { facet: 'profession', name: 'welder', nouns: ['Welder', 'Pipe Welder'] },
    { facet: 'hobby', name: 'fishing', nouns: ['Fisherman', 'Bass Fishing Dad'] },
    { facet: 'hobby', name: 'gardening', nouns: ['Gardener', 'Plant Lady'] },
    { facet: 'hobby', name: 'pickleball', nouns: ['Pickleball Player', 'Pickleball Grandma'] },
    { facet: 'animal', name: 'cat', nouns: ['Cat Mom', 'Cat Dad', 'Black Cat'] },
    { facet: 'animal', name: 'corgi', nouns: ['Corgi Mom', 'Corgi Dad'] },
    { facet: 'animal', name: 'axolotl', nouns: ['Axolotl Lover', 'Kawaii Axolotl'] },
    { facet: 'food', name: 'coffee', nouns: ['Coffee Lover', 'Iced Coffee Addict'] },
    { facet: 'food', name: 'tacos', nouns: ['Taco Lover', 'Taco Tuesday Crew'] },
    { facet: 'cause', name: 'autism-awareness', nouns: ['Autism Mom', 'Autism Awareness'] },
    { facet: 'cause', name: 'mental-health', nouns: ['Mental Health Advocate'] },
    { facet: 'identity', name: 'grandma', nouns: ['Grandma', 'Best Grandma Ever'] },
    { facet: 'identity', name: 'girl-dad', nouns: ['Girl Dad', 'Dad of Three'] },
    { facet: 'culture', name: 'anime', nouns: ['Anime Fan', 'Ramen and Anime'] },
    { facet: 'culture', name: 'cottagecore', nouns: ['Cottagecore Mushroom', 'Cottagecore Frog'] },
    { facet: 'holiday', name: 'halloween', nouns: ['Halloween Ghost', 'Spooky Season'] },
    { facet: 'holiday', name: 'christmas', nouns: ['Christmas Elf', 'Ugly Christmas Sweater'] },
    { facet: 'occasion', name: 'retirement', nouns: ['Retired 2026', 'Retirement Squad'] },
    { facet: 'occasion', name: 'graduation', nouns: ['Class of 2026 Grad'] },
    { facet: 'place', name: 'texas', nouns: ['Texas Roots', 'Austin Texas'] },
    { facet: 'place', name: 'colorado', nouns: ['Colorado Mountains'] },
    { facet: 'party-theme', name: 'bachelorette', nouns: ['Bachelorette Party Bride'] },
    { facet: 'party-theme', name: 'birthday', nouns: ['Birthday Squad', 'Birthday Girl'] },
];

export const SEED_SENTIMENTS: readonly string[] = [
    'Funny',
    'Vintage Retro',
    'Cute',
    'Sarcastic',
    'Groovy',
    'Distressed',
    'Minimalist',
    'Gift Idea',
];

export const SEED_GARMENTS: readonly string[] = [
    'T-Shirt',
    'Tee',
    'Long Sleeve Shirt',
    'Sweatshirt',
    'Hoodie',
    'Tank Top',
    'V-Neck T-Shirt',
    'Raglan Shirt',
];

export const SEED_BRANDS: readonly string[] = [
    'Rank Wrangler Apparel',
    'Sagebrush Tee Co',
    'Dusty Trail Prints',
    'Loud Llama Goods',
    'Front Porch Threads',
    'Copper Canyon Tees',
    'Blue Mesa Merch',
    'Third Shift Studio',
];

/**
 * Only the seller's own bullets reach `products.bullet_1` / `bullet_2`: the
 * shipped classifier reads the Merch template bullets as evidence and then
 * drops them, and a known non-Merch listing stores no bullets at all. These are
 * therefore written only for Products whose `is_merch_listing` is true.
 */
export const SEED_DESIGN_BULLETS: readonly string[] = [
    'Original hand-drawn design, printed on demand just for you.',
    'Distressed vintage texture that stays soft wash after wash.',
    'Bold front print sized for a comfortable, everyday fit.',
    'Makes a thoughtful birthday or holiday gift for anyone on your list.',
    'Pairs well with jeans, joggers, and absolutely nothing formal.',
];

export const SEED_CATEGORIES: readonly { readonly id: number; readonly name: string }[] = [
    { id: 7_141_123_011, name: 'Clothing, Shoes & Jewelry' },
    { id: 165_793_011, name: 'Toys & Games' },
    { id: 1_055_398, name: 'Home & Kitchen' },
    { id: 1_000, name: 'Books' },
    { id: 3_760_911, name: 'Kitchen & Dining' },
];

/**
 * Search terms for the Catalog-search explorer and the Top Search Terms views.
 * Deliberately mixed: apparel-intent terms the shipped classifier keeps, and
 * commodity and brand terms it blocks, so both sides of `isMerchRelevant` and
 * the merch-only filter have rows to show.
 */
export const SEED_MERCH_SEARCH_TERMS: readonly string[] = [
    'funny nurse shirt',
    'cat mom t shirt',
    'retirement shirt 2026',
    'girl dad shirt',
    'autism awareness shirt',
    'teacher tee funny',
    'halloween shirt women',
    'christmas sweatshirt family',
    'pickleball shirt funny',
    'corgi mom hoodie',
    'axolotl shirt kids',
    'bachelorette party shirts',
    'coffee lover tee',
    'taco tuesday shirt',
    'graduation shirt 2026',
    'cottagecore mushroom shirt',
    'welder dad shirt',
    'fishing shirt for men funny',
    'gardening shirt plant lady',
    'anime shirt aesthetic',
    'birthday squad shirts',
    'mental health matters shirt',
    'texas roots shirt',
    'colorado mountains tee',
    'grandma shirt gift',
];

export const SEED_BLOCKED_SEARCH_TERMS: readonly string[] = [
    'nintendo switch 2',
    'air fryer',
    'lego star wars',
    'iphone 17 case',
    'stanley cup tumbler',
    'protein powder',
    'black shirt',
    'white t shirt',
    'dyson vacuum',
    'coffee maker',
];
