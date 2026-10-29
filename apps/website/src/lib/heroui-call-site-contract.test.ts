import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanTags } from './jsx-tag-scan';

/**
 * Guarded contract for HeroUI call sites (AGENTS.md "UI Component Rules"): a
 * HeroUI component takes layout and overflow classes only; its shape, fill,
 * ink, padding, type and edge come from its variants and the theme. Skeleton
 * is exempt (its size is the placeholder). Cursors and icons go through the
 * shared conventions.
 */

const sourceRoot = join(import.meta.dir, '..');

/**
 * Appearance classes: corners, fixed heights and widths, fills, inks, padding,
 * type and borders. Layout (`flex`, `gap-*`, `min-*`, `h-full`, `w-full`,
 * `truncate`, `sr-only`) stays allowed.
 */
const appearance =
    /(?<![\w-])(?:rounded(?:-[\w[\]]+)?|h-(?!full|auto|fit|screen)[\w[\].]+|w-(?!full|auto|fit|screen|max|min)[\w[\].]+|bg-[\w[\]/.-]+|p[xytrbse]?-[\w[\].]+|font-[\w-]+|border(?:-[\w[\]/.-]+)?|text-(?:muted|foreground|accent|danger|success|warning|default|tier-[\w-]+))(?![\w-])/g;

describe('heroui call-site contract', () => {
    const files = listSourceFiles(sourceRoot).map(path => ({
        content: readFileSync(path, 'utf8'),
        path: relative(sourceRoot, path),
    }));

    test('HeroUI components take layout classes only', () => {
        const fixture = (className: string, name = 'Chip') =>
            styledHeroui(
                `import { ${name} } from '@heroui/react';\n<${name} className="${className}" />`
            );
        expect(fixture('rounded-xl')).toEqual(['Chip: rounded-xl']);
        expect(fixture('bg-accent px-2 font-mono border-b w-24')).toHaveLength(5);
        expect(fixture('flex min-w-0 flex-1 truncate w-full h-full')).toEqual([]);
        expect(fixture('h-3 w-full rounded-xl', 'Skeleton')).toEqual([]);
        const offenders = files.flatMap(file =>
            styledHeroui(file.content).map(hit => `${file.path}: ${hit}`)
        );
        expect(offenders).toEqual([]);
    });

    test('controls keep the arrow cursor', () => {
        const pointer = /(?<![\w-])cursor-pointer(?![\w-])/;
        expect(pointer.test('className="cursor-pointer"')).toBe(true);
        expect(files.filter(file => pointer.test(file.content)).map(file => file.path)).toEqual([]);
    });

    test('no text glyph stands in for an icon', () => {
        expect(glyphsIn('<span>▲ 12%</span>')).toEqual(['▲']);
        expect(glyphsIn('<KeyHint keyLabel="⏎">open</KeyHint>')).toEqual(['⏎']);
        expect(glyphsIn("const sort = '↓';")).toEqual(['↓']);
        expect(glyphsIn('// ⏎ opens the row\n/** j/k and ↑/↓ */\n<span>Next</span>')).toEqual([]);
        expect(glyphsIn("const caret = '\\u25B8';")).toEqual(['\\u25B8']);
        expect(glyphsIn('<span>{"\\u{2193}"}</span>')).toEqual(['\\u{2193}']);
        expect(glyphsIn("const ok = '\\u00B7';")).toEqual([]);
        const offenders = files.flatMap(file =>
            glyphsIn(file.content).map(glyph => `${file.path}: ${glyph}`)
        );
        expect(offenders).toEqual([]);
        const theme = readdirSync(join(sourceRoot, 'styles/theme')).flatMap(name =>
            [
                ...readFileSync(join(sourceRoot, 'styles/theme', name), 'utf8').matchAll(cssGlyph),
            ].map(match => `styles/theme/${name}: ${match[0]}`)
        );
        expect('.x::before { content: "\\25B8 "; }'.match(cssGlyph)).toHaveLength(1);
        expect(theme).toEqual([]);
    });

    test('features render HeroUI controls and grids, not native buttons or tables', () => {
        expect(nativeMarkup('<button type="button" onClick={go}>Go</button>')).toEqual([
            '<button',
            'onClick=',
        ]);
        expect(nativeMarkup('<table><tr><td>1</td></tr></table>')).toEqual([
            '<table',
            '<tr',
            '<td',
        ]);
        expect(nativeMarkup('<Button onPress={go}>Go</Button><DataGrid />')).toEqual([]);
        const offenders = files
            .filter(file => file.path.startsWith('features/'))
            .flatMap(file => nativeMarkup(file.content).map(hit => `${file.path}: ${hit}`));
        expect(offenders).toEqual([]);
    });

    test('icons render through components/ui/icon.tsx', () => {
        const direct = /from ['"]@hugeicons\/react['"]/;
        const offenders = files
            .filter(file => file.path !== 'components/ui/icon.tsx' && direct.test(file.content))
            .map(file => file.path);
        expect(offenders).toEqual([]);
    });
});

/**
 * Arrows, triangles, chevrons, return and media glyphs drawn as text. Each has
 * a Hugeicons Pro glyph (through components/ui/icon.tsx; a key hint is a Kbd
 * holding an Icon). Comments may still name keys with them.
 */
const glyphChars = '▲▼△▽▴▾▸▹◂◃►◄▶◀⏎↵↩↪↑↓←→⇧⇡⇣❚⏸⏵⏯⏹✓✔✕✖✗';

/** The same glyphs' code points, so `\u25B8`, `\u{25B8}` and CSS `\25B8` are caught too. */
const glyphHex = [...glyphChars].map(glyph => glyph.codePointAt(0)?.toString(16) ?? '').join('|');

const iconGlyph = new RegExp(`[${glyphChars}]|\\\\u\\{?0*(?:${glyphHex})\\}?(?![0-9a-f])`, 'giu');

const cssGlyph = new RegExp(
    `content:\\s*["'][^"']*(?:[${glyphChars}]|\\\\0*(?:${glyphHex})(?![0-9a-f]))[^"']*["']`,
    'giu'
);

/** Native controls and tables in feature code: HeroUI Button/Link and DataGrid own these. */
const nativeMarkup = (source: string) =>
    [...source.matchAll(/<(?:button|table|tr|td|th)(?=[\s>/])|\bonClick=/g)].map(match => match[0]);

/** Icon glyphs in code (JSX text, strings, props), comments stripped first. */
const glyphsIn = (source: string) =>
    [
        ...source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1')
            .matchAll(iconGlyph),
    ].map(match => match[0]);

/** Appearance classes on a component imported from `@heroui/react` or `@heroui-pro/react`. */
const styledHeroui = (source: string) => {
    const imported = new Set(
        [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@heroui(?:-pro)?\/react[^'"]*['"]/g)]
            .flatMap(match => (match[1] ?? '').split(','))
            .map(name => name.replace(/^\s*type\s+/, '').trim())
            .filter(Boolean)
    );
    return scanTags(source).flatMap(tag => {
        const owner = tag.name.split('.')[0] ?? '';
        if (!imported.has(owner) || owner === 'Skeleton') {
            return [];
        }
        const value = tag.attributes.match(/\bclassName=(\{[^}]*\}|"[^"]*"|'[^']*')/)?.[1] ?? '';
        return [...value.matchAll(appearance)].map(match => `${tag.name}: ${match[0]}`);
    });
};

const listSourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(path);
        }
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
