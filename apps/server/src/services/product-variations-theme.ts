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

const PUBLIC_KEY_CATALOG_ALIASES: Readonly<Record<string, readonly string[]>> = {
    color: ['color', 'color_name'],
    size: ['size', 'size_name'],
    fit: ['fit_type', 'fit', 'fit_type_name'],
    department: ['department', 'department_name'],
    style: ['style', 'style_name'],
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
