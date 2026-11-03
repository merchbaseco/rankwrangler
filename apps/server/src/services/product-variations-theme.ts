/** Catalog Items 2022-04-01 theme labels → public attribute keys Merch apparel uses. */
const THEME_TO_PUBLIC_KEY: Readonly<Record<string, string>> = {
    color: 'color',
    color_name: 'color',
    COLOR_NAME: 'color',
    size: 'size',
    size_name: 'size',
    SIZE_NAME: 'size',
    fit: 'fit',
    fit_type: 'fit',
    FIT_TYPE: 'fit',
    department: 'department',
    department_name: 'department',
    DEPARTMENT_NAME: 'department',
    style: 'style',
    style_name: 'style',
    STYLE_NAME: 'style',
};

/** Size aliases follow Amazon apparel attribute priority (shirt_size before plain size). */
const PUBLIC_KEY_CATALOG_ALIASES: Readonly<Record<string, readonly string[]>> = {
    color: ['color', 'color_name'],
    size: ['shirt_size', 'apparel_size', 'size', 'size_name', 'bottoms_size', 'headwear_size'],
    fit: ['fit_type', 'fit', 'fit_type_name'],
    department: ['department', 'department_name'],
    style: ['style', 'style_name'],
};

/**
 * Catalog alpha size tokens → merch display labels. Unknown values stay as-is.
 * Includes Amazon long forms (`medium`, `x_large`) and Merch short spellings
 * (`m`, `x_l`, `2x`, `2_years`) observed on live Catalog apparel sizes.
 */
const ALPHA_SIZE_LABELS: Readonly<Record<string, string>> = {
    xx_small: '2XS',
    '2x_small': '2XS',
    x_small: 'XS',
    x_s: 'XS',
    small: 'S',
    s: 'S',
    medium: 'M',
    m: 'M',
    large: 'L',
    l: 'L',
    x_large: 'XL',
    x_l: 'XL',
    xx_large: '2XL',
    xx_l: '2XL',
    '2x_large': '2XL',
    '2x_l': '2XL',
    '3x_large': '3XL',
    '3x_l': '3XL',
    '4x_large': '4XL',
    '4x_l': '4XL',
    '5x_large': '5XL',
    '5x_l': '5XL',
    '6x_large': '6XL',
    '6x_l': '6XL',
    '1x': '1X',
    '2x': '2X',
    '3x': '3X',
    '4x': '4X',
    '5x': '5X',
    '6x': '6X',
    '2_years': '2T',
    '3_years': '3T',
    '4_years': '4T',
};

export const publicAttributeKey = (themeAttribute: string) => {
    const trimmed = themeAttribute.trim();
    if (!trimmed) {
        return trimmed;
    }
    const mapped = THEME_TO_PUBLIC_KEY[trimmed] ?? THEME_TO_PUBLIC_KEY[trimmed.toUpperCase()];
    if (mapped) {
        return mapped;
    }
    return trimmed.replace(/_name$/i, '').toLowerCase();
};

export const uniquePublicThemeKeys = (names: readonly string[]): readonly string[] => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const name of names) {
        const key = publicAttributeKey(name);
        if (!key || seen.has(key)) {
            continue;
        }
        seen.add(key);
        keys.push(key);
    }
    return keys;
};

export const catalogKeysForPublicAttribute = (publicKey: string): readonly string[] =>
    PUBLIC_KEY_CATALOG_ALIASES[publicKey] ?? [publicKey, `${publicKey}_name`];

export const normalizeAlphaSize = (raw: string): string => {
    const key = raw.trim().toLowerCase().replace(/[-\s]+/g, '_');
    return ALPHA_SIZE_LABELS[key] ?? matchPatternSize(key) ?? raw.trim();
};

/** Nx_l → NXL, Nx → NX (plus), N_years → NT (toddler). */
const matchPatternSize = (key: string): string | null => {
    const alphaLarge = /^(\d+)x_l$/.exec(key);
    if (alphaLarge) {
        return `${alphaLarge[1]}XL`;
    }
    const plus = /^(\d+)x$/.exec(key);
    if (plus) {
        return `${plus[1]}X`;
    }
    const toddler = /^(\d+)_years$/.exec(key);
    if (toddler) {
        return `${toddler[1]}T`;
    }
    return null;
};

/**
 * Catalog attribute entries may be `{ value }` or apparel objects like
 * `{ size: "medium", size_class: "alpha", ... }`. Prefer `.size`, then `.value`
 * (including nested objects), so theme dimensions are not dropped.
 */
export const catalogEntryDisplayString = (entry: unknown): string | null => {
    if (entry === null || entry === undefined || typeof entry !== 'object') {
        return null;
    }
    const record = entry as Readonly<Record<string, unknown>>;
    const fromSize = primitiveDisplayString(record.size);
    if (fromSize) {
        return fromSize;
    }
    if (record.value === undefined || record.value === null) {
        return null;
    }
    if (typeof record.value === 'object') {
        return catalogEntryDisplayString(record.value);
    }
    return primitiveDisplayString(record.value);
};

export const displayStringForPublicAttribute = (publicKey: string, raw: string): string =>
    publicKey === 'size' ? normalizeAlphaSize(raw) : raw;

const primitiveDisplayString = (value: unknown): string | null => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const trimmed = String(value).trim();
        return trimmed || null;
    }
    return null;
};
