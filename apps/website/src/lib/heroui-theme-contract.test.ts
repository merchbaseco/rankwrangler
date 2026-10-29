import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blocksIn, herouiBlocks, proBlocksDir, proBlocksInstalled } from './heroui-blocks';
import proBlocks from './heroui-pro-blocks.json';

/**
 * Guarded contract for the theme files (AGENTS.md "UI Component Rules"):
 * overrides re-point HeroUI tokens or set layout, they never redraw a
 * component or hide its state; colours come from the palette and radii from
 * tokens. Every allowlist entry names its reason. Each rule proves itself on
 * a fixture before it reads the real files.
 */

const themeDir = join(import.meta.dir, '../styles/theme');
const themeFiles = readdirSync(themeDir).filter(name => name.endsWith('.css'));
/** Below the token rung: no px radii, colour mixes or literal colours here. */
const ruleFiles = [
    'overrides.css',
    'grid-overrides.css',
    'product.css',
    'art.css',
    'shell.css',
    'grid.css',
    'grid-cells.css',
    'mix.css',
    'screens.css',
];

/**
 * Selectors allowed to re-point `--spacing`: HeroUI sizes controls in spacing multiples.
 * (The pane bars' square corners are a token re-point in tokens.css, not a style rule.)
 */
const spacingScopes: Record<string, string> = {
    ':root': 'the base step',
    '.context-menu__popover, .dropdown__popover, .menu': 'menus are lists to scan',
    '.kbd': '18px key caps',
    '.navbar.app-banner': "the banner's 30px tabs, buttons and avatar (Grid J)",
    '.grid-sidebar': "the sidebar's 36px fields and 16px check and radio controls (Grid J)",
    '.pane-bar :is(.button, .toggle-button, .tag, .segment, .close-button, .chip)':
        'pane-bar controls fill the 24px bar edge to edge',
    '.key-value .button': 'the 20px controls inside 23px key/value rows',
};

/** Non-layout properties set on a HeroUI `block__part`, each with its reason. */
const herouiStyleAllowlist: Record<string, string> = {
    'overrides.css .tabs:not(.tabs--secondary) > .tabs__list-container background-color':
        'the segmented list sits in the well; `--default` is the hover tone here',
    'overrides.css .menu-item > svg height': 'HeroUI leaves menu-item glyphs unsized',
    'overrides.css .menu-item > svg color': 'menu glyphs read muted beside their label',
    'overrides.css .chip > svg height': 'HeroUI leaves chip glyphs unsized',
    'overrides.css .tabs__tab > svg height': 'HeroUI leaves tab glyphs unsized',
    'overrides.css .tooltip word-break': 'HeroUI breaks words mid-token (`break-all`)',
    'overrides.css .tooltip.cursor-tooltip translate': 'the cursor tooltip follows the pointer',
    'overrides.css .tooltip.cursor-tooltip transition':
        'motion that trails the cursor reads as lag',
    'overrides.css .tooltip.cursor-tooltip will-change': 'pointer-following moves every frame',
    'overrides.css .tooltip.cursor-tooltip[data-entering="true"], .tooltip.cursor-tooltip[data-exiting="true"] animation':
        'no enter/exit motion for a tooltip that trails the cursor',
    'overrides.css .tooltip.cursor-tooltip[data-exiting] visibility':
        'it vanishes at once rather than lingering where the pointer left',
    'overrides.css .kbd font-family': 'key caps are figures, set in mono',
    'overrides.css .breadcrumbs .breadcrumbs__link:hover, .breadcrumbs .breadcrumbs__link[data-hovered="true"] text-decoration':
        'wayfinding links drop the underline (HeroUI taste rule)',
    'overrides.css .breadcrumbs .breadcrumbs__link[data-current="true"] color':
        'the current crumb reads in ink',
    'overrides.css .modal__dialog--cover.settings-modal min-height':
        "cover's full-height floor would override the sheet's max-height cap",
    'overrides.css .navbar.app-banner color':
        "the banner's graphite ink; the body's light-theme ink would vanish on it",
    'grid-overrides.css .data-grid.hairline-grid--fixed .table__content table-layout':
        'columns take their width tokens, so the KPI cells above span exact column groups',
    'grid-overrides.css .data-grid.hairline-grid :is(.table__column, .table__cell) padding-block':
        'the fixed row height sets the line',
    'grid-overrides.css .data-grid.hairline-grid :is(.table__column, .table__cell) padding-inline':
        "the mock's 12px cell gutter, shared with the KPI cells and sidebar",
    'grid-overrides.css .data-grid.hairline-grid :is(.table__column, .table__cell) border-right':
        'Grid J draws a full hairline grid: every column ruled',
    'grid-overrides.css .data-grid.hairline-grid :is(.table__column, .table__cell) border-bottom':
        'Grid J draws a full hairline grid: every row ruled, the header included',
    'grid-overrides.css .data-grid.hairline-grid :is(.table__column, .table__cell):last-child border-right':
        "the last column closes on the surface's own edge",
    'grid-overrides.css .data-grid.hairline-grid .table__column height':
        "the mock's 40px header row (24px compact)",
    'grid-overrides.css .data-grid.hairline-grid .table__column background-color':
        'headings sit on the content surface, not the secondary pill fill',
    'grid-overrides.css .data-grid.hairline-grid .table__column color':
        'headings read in ink (mock `.gh`), not muted fine print',
    'grid-overrides.css .data-grid.hairline-grid .table__column font-size':
        'headings at the body size (mock 14px), not the stock caption size',
    'grid-overrides.css .data-grid.hairline-grid .table__column::after content':
        'the hairlines divide the header; the stock separator tick would double them',
    'grid-overrides.css .data-grid.hairline-grid .table__body > [role="row"] height':
        "text rows hold the density's height whatever a cell holds",
    'grid-overrides.css .data-grid.hairline-grid--fixed .table__body > [role="row"] height':
        "art rows hold Grid J's 56px (24px compact)",
    'grid-overrides.css .data-grid.hairline-grid .table__body .table__row:is(:hover, [data-hovered="true"]) .table__cell background-color':
        "hover's stock grey matches nothing in the mock; it takes the faint accent tint",
    'grid-overrides.css .data-grid.hairline-grid .table__row[data-selected="true"] .table__cell background-color':
        'HeroUI tints selection at surface/10, too faint for the j/k cursor',
    'grid-overrides.css .data-grid.hairline-grid .table__row[data-selected="true"] .table__cell:first-child box-shadow':
        'the cursor row is marked by a leading bar, not a ring that reads taller',
    'grid-overrides.css .kpi-group.grid-kpis border-bottom':
        'the KPI header is ruled off from the grid header below it',
    'grid-overrides.css .kpi-group.grid-kpis > .kpi padding':
        "KPI cells pad on the grid's 12px cell gutter",
    'grid-overrides.css .kpi-group.grid-kpis > .kpi border-right':
        'KPI cells are ruled on the right like the grid cells under them, so the lines meet',
    'grid-overrides.css .kpi-group.grid-kpis > .kpi:last-child border-right':
        "the last KPI cell closes on the surface's own edge",
    'grid-overrides.css .kpi-group.grid-kpis--product border-bottom':
        'wrapped Product figures rule each row off themselves',
    'grid-overrides.css .kpi-group.grid-kpis--product > .kpi border-bottom':
        'wrapped Product figures rule each row off themselves',
    'grid-overrides.css .kpi-group.grid-kpis .kpi__title font-weight':
        'stat labels are regular weight (Grid J), not the stock medium',
    'grid-overrides.css .kpi-group.grid-kpis grid-template-columns':
        "the KPI row lays out on the grid's own column template",
    'grid-overrides.css .kpi-group.grid-kpis .kpi__value font-family':
        'KPI figures are set in the figures face, like every grid number',
    'grid-overrides.css .kpi-group.grid-kpis .kpi__value font-variant-numeric':
        'KPI figures keep tabular digits',
    'grid-overrides.css .grid-sidebar .label font-weight':
        'sidebar group headings are semibold (Grid J `.sh`), not the stock medium',
    'grid-overrides.css .filter-options:is(.checkbox-group, .radio-group) :is([data-slot="checkbox"], [data-slot="radio"]) min-height':
        "Grid J's 32px option rows",
    'grid-overrides.css :is(.sold-cell, .median-cell) > .meter .meter__track height':
        "a cell meter's track is the cell's ground, so it takes the cell's height",
    'mix.css .toggle-button.mix-bar__segment height':
        'a mix segment is a 12px bar, not a 36px button (HeadO)',
    'mix.css .toggle-button.mix-bar__segment padding':
        'a mix segment is a bare swatch; its width is its share',
    'mix.css .toggle-button.mix-bar__segment:is(:hover, [data-hovered="true"], [data-focus-visible="true"]), .toggle-button.mix-bar__segment[data-selected="true"] height':
        'the pointed-at or chosen segment rises to the full line (HeadO)',
    'mix.css .toggle-button.mix-bar__segment:is(:hover, [data-hovered="true"], [data-focus-visible="true"]), .toggle-button.mix-bar__segment[data-selected="true"] box-shadow':
        'the pointed-at or chosen segment is ringed in its own ink (HeadO)',
    'mix.css .mix-bar__track:has(.mix-bar__segment:is(:hover, [data-hovered="true"])) .toggle-button.mix-bar__segment:not(:hover, [data-hovered="true"]), .toggle-button.mix-bar__segment.mix-bar__segment--dim opacity':
        'the other parts recede while one is pointed at or chosen (HeadO)',
    'grid.css :is(.checkbox, .radio)[data-selected="true"] .filter-option color':
        "a chosen sidebar option brightens to ink from the shell's muted option ink",
    'grid.css .grid-main > [data-slot="context-menu-trigger"], .data-grid.hairline-grid--fill min-height':
        'a grid fills the main column and scrolls inside it',
    'screens.css .data-grid.hairline-grid .grid-col--wide display':
        'narrow windows drop low-priority columns',
    'screens.css .data-grid.hairline-grid .grid-col--secondary display':
        'phones drop the columns a 390px grid cannot hold',
};

/**
 * Layout a theme rule may set on a HeroUI selector without an exception. Height,
 * min-height and padding are left out: HeroUI sizes those from its own tokens,
 * so changing one is a density decision that needs its reason above.
 */
const isLayout = (property: string, value: string) =>
    (property === 'display' && value !== 'none') || layoutProperty.test(property);

const layoutProperty =
    /^(?:(?:min-|max-)?width|max-height|flex(?:-[a-z]+)?|gap|margin(?:-[a-z]+)*|align-[a-z]+|justify-[a-z]+|white-space|overflow(?:-[a-z]+)?|position|top|bottom|inset(?:-[a-z]+)*|z-index|vertical-align|border(?:-[a-z]+)?-width)$/;

describe('heroui theme contract', () => {
    test.if(proBlocksInstalled)(
        'the committed HeroUI Pro block list matches the installed dist',
        () => {
            expect([...proBlocks].sort()).toEqual(blocksIn(proBlocksDir).sort());
        }
    );

    const read = (name: string) => ({ css: readFileSync(join(themeDir, name), 'utf8'), name });
    const rules = ruleFiles.map(read);
    const styled = ruleFiles.flatMap(name =>
        herouiStyles(read(name).css).map(hit => `${name} ${hit}`)
    );

    test('radii come from tokens, never a literal px corner', () => {
        expect(pxRadii('.x { border-radius: 4px; }')).toEqual(['border-radius: 4px']);
        expect(pxRadii('.x { border-radius: var(--radius-mark); }')).toEqual([]);
        expect(rules.flatMap(file => pxRadii(file.css).map(hit => `${file.name}: ${hit}`))).toEqual(
            []
        );
    });

    test('no rule hides a HeroUI part or its state', () => {
        expect(hiddenState('.tabs.x .tabs__indicator { display: none; }')).toHaveLength(1);
        expect(hiddenState('.tabs.x .tabs__indicator { visibility: hidden; }')).toHaveLength(1);
        expect(hiddenState('.tabs__tab[data-disabled="true"] { opacity: 1; }')).toHaveLength(1);
        expect(hiddenState('.x[data-selected="true"] { visibility: visible; }')).toHaveLength(1);
        expect(hiddenState('.my-thing__part { display: none; }')).toEqual([]);
        expect(rules.flatMap(file => hiddenState(file.css))).toEqual([]);
    });

    test('colours come from the palette: no mixes or literals outside it', () => {
        expect(literalColours('.x { color: #fff; background: rgb(0 0 0); }')).toHaveLength(2);
        expect(literalColours('.x { color: color-mix(in oklab, red, blue); }')).toHaveLength(1);
        expect(literalColours('.x { color: var(--muted); }')).toEqual([]);
        const offenders = themeFiles
            .filter(name => name !== 'palette.css')
            .flatMap(name => literalColours(read(name).css).map(hit => `${name}: ${hit}`));
        expect(offenders).toEqual([]);
    });

    test('only the documented density scopes re-point --spacing', () => {
        expect(spacingRepoints('.x .y { --spacing: 1px; }')).toEqual(['.x .y']);
        const offenders = themeFiles
            .flatMap(name => spacingRepoints(read(name).css))
            .filter(selector => !(selector in spacingScopes));
        expect(offenders).toEqual([]);
    });

    test('theme rules on HeroUI selectors set tokens and layout only', () => {
        expect(herouiStyles('.tabs__tab { color: red; gap: 1px; --x: 1; }')).toEqual([
            '.tabs__tab color',
        ]);
        expect(
            herouiStyles('.pane-bar .button { height: 20px; padding-inline: 5px; --button-fg: x; }')
        ).toEqual(['.pane-bar .button height', '.pane-bar .button padding-inline']);
        expect(
            herouiStyles('.pane-bar .button { height: 20px; background: var(--accent); }')
        ).toEqual(['.pane-bar .button height', '.pane-bar .button background']);
        expect(herouiStyles('.mine { color: red; } .button-like { color: red; }')).toEqual([]);
        expect(styled.filter(hit => !(hit in herouiStyleAllowlist))).toEqual([]);
    });

    test('every HeroUI-style exception is still in use', () => {
        const hits = new Set(styled);
        expect(Object.keys(herouiStyleAllowlist).filter(entry => !hits.has(entry))).toEqual([]);
    });
});

interface CssRule {
    readonly selector: string;
    readonly declarations: readonly { readonly property: string; readonly value: string }[];
}

/** Leaf rules (selector and declarations), comments dropped, selectors whitespace-normalized. */
const cssRules = (css: string): CssRule[] =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
        ([, selector = '', body = '']) => ({
            declarations: body
                .split(';')
                .map(part => part.split(':'))
                .filter(([property, ...value]) => property?.trim() && value.length > 0)
                .map(([property = '', ...value]) => ({
                    property: property.trim(),
                    value: value.join(':').trim(),
                })),
            selector: selector.trim().replace(/\s+/g, ' ').replace(/ ?, ?/g, ', '),
        })
    );

/** A HeroUI or Pro component root (`.button`, `.data-grid`) or part (`.tabs__tab`). */
const isHerouiSelector = (selector: string) =>
    herouiBlocks.some(block => new RegExp(`\\.${block}(?:__[a-z-]+)?(?![\\w-])`).test(selector));

const isHerouiPart = (selector: string) =>
    herouiBlocks.some(block => new RegExp(`\\.${block}__[a-z-]+`).test(selector));

const pxRadii = (css: string) =>
    cssRules(css).flatMap(rule =>
        rule.declarations
            .filter(d => /radius$/.test(d.property) && /\b\d+(?:\.\d+)?px\b/.test(d.value))
            .map(d => `${d.property}: ${d.value}`)
    );

const hiddenState = (css: string) =>
    cssRules(css).flatMap(rule => {
        const statePart = /\[data-(?:disabled|selected)|__indicator/.test(rule.selector);
        return rule.declarations
            .filter(
                d =>
                    (isHerouiPart(rule.selector) &&
                        d.property === 'display' &&
                        d.value === 'none') ||
                    (isHerouiPart(rule.selector) && d.property === 'visibility') ||
                    (statePart && (d.property === 'opacity' || d.property === 'visibility'))
            )
            .map(d => `${rule.selector} ${d.property}`);
    });

const literalColours = (css: string) =>
    [
        ...css
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/gi),
    ].map(match => match[0]);

const spacingRepoints = (css: string) =>
    cssRules(css)
        .filter(rule => rule.declarations.some(d => d.property === '--spacing'))
        .map(rule => rule.selector);

const herouiStyles = (css: string) =>
    cssRules(css)
        .filter(rule => isHerouiSelector(rule.selector))
        .flatMap(rule =>
            rule.declarations
                .filter(d => !(d.property.startsWith('--') || isLayout(d.property, d.value)))
                .map(d => `${rule.selector} ${d.property}`)
        );
