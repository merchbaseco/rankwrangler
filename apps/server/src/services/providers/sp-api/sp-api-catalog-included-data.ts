// Every catalog search asks for the same item sections. Merch classification reads `identifiers`
// (UPC, EAN, GTIN) and the package dimensions and weight under `attributes`.
export const CATALOG_INCLUDED_DATA = [
    'summaries',
    'salesRanks',
    'attributes',
    'identifiers',
    'images',
    'relationships',
] as const;
