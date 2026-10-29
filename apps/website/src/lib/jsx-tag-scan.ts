/**
 * A small JSX tag scanner for the HeroUI contract tests: reads every opening and
 * closing tag with its raw attribute text, without a parser dependency.
 */

export interface JsxTag {
    /** Element name (`div`, `Widget.Header`), or `/Name` for a closing tag. */
    readonly name: string;
    /** Raw attribute text between the name and the closing `>`. */
    readonly attributes: string;
    readonly selfClosing: boolean;
}

const tagStart = /<(\/?)([A-Za-z][\w]*(?:\.[A-Za-z][\w]*)?)?(?=[\s/><])/g;

/**
 * Every JSX tag in source order, attributes kept whole: braces, quotes and
 * template literals are tracked, so `=>` or `>` inside an attribute
 * expression never ends the tag, and tags inside an attribute (a `render`
 * function's element) are not read as children. A type argument
 * (`<Tooltip.Trigger<'span'>`) is stepped over. Fragments (`<>`, `</>`) are
 * skipped; they add no element between a part and its children.
 */
export const scanTags = (source: string): JsxTag[] => {
    const tags: JsxTag[] = [];
    const pattern = new RegExp(tagStart.source, 'g');
    let match = pattern.exec(source);
    while (match) {
        const name = match[2];
        let from = match.index + match[0].length;
        if (name && source[from] === '<') {
            from = source.indexOf('>', from) + 1;
        }
        const end = name ? findTagEnd(source, from) : -1;
        if (name && end !== -1) {
            const attributes = source.slice(from, end);
            tags.push({
                attributes,
                name: match[1] ? `/${name}` : name,
                selfClosing: attributes.trimEnd().endsWith('/'),
            });
            pattern.lastIndex = end + 1;
        }
        match = pattern.exec(source);
    }
    return tags;
};

const findTagEnd = (source: string, from: number) => {
    let depth = 0;
    let quote: string | null = null;
    for (let index = from; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === quote && source[index - 1] !== '\\') {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
        } else if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
        } else if (char === '>' && depth === 0) {
            return index;
        }
    }
    return -1;
};
