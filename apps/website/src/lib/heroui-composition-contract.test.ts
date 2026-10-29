import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanTags } from './jsx-tag-scan';

/**
 * Guarded contract for HeroUI composition (AGENTS.md, "UI Component Rules").
 * Ported from Haus: its spacing test, plus the two GritQL lint plugins
 * (`heroui-compound-children.grit`, `heroui-dialog-form.grit`) restated here
 * because this repo has no website Biome config to load plugins into.
 *
 * HeroUI components carry their own padding, gap and part layout. Cancelling
 * that spacing at a call site, or dropping a layout element into a part that
 * lays out its own children, is how a component gets neutralized so hand-drawn
 * layout can take its place. Do not widen an allowlist to make the suite pass;
 * a new entry is a deliberate decision that names its reason.
 */

const sourceRoot = join(import.meta.dir, '..');

/**
 * Call sites allowed to cancel a HeroUI component's own spacing. Every entry
 * states why the component is hosting a full-bleed surface rather than content.
 */
const spacingOverrideAllowlist: Record<string, string> = {};

/** Components whose spacing is part of the design system, not a suggestion. */
const spacingOwners = new Set([
    'Card',
    'ItemCard',
    'ItemCardGroup',
    'Modal',
    'Drawer',
    'Sheet',
    'AlertDialog',
    'Widget',
    'KPI',
    'KPIGroup',
]);

const cancelledSpacing = /(?<![\w-])(?:p|px|py|pt|pb|ps|pe|gap|m)-0(?![\w.\-/[])/;

/** Compound parts that lay out their own children (title over description, actions trailing). */
const layoutOwningParts = new Set([
    'AlertDialog.Footer',
    'AlertDialog.Header',
    'Card.Header',
    'Modal.Footer',
    'Modal.Header',
    'Widget.Header',
]);

const layoutElements = new Set(['div', 'section', 'span']);

const dialogFooters = /<(?:AlertDialog|Drawer|Modal)\.Footer[\s>]/;

const sourceFilePattern = /\.tsx?$/;
const testFilePattern = /\.(test|spec)\.tsx?$/;
const legacyImportPattern = /from ['"](?:@base-ui-components\/|lucide-react)/;

/**
 * The type scale lives in tokens.css (Grid direction: 14px body, 13px
 * secondary, 15px names, 16px BSR figures, 20px KPI figures). Call sites take
 * the body size from HeroUI and larger steps only through structural classes
 * (`.design-cell__name`, `.bsr-figure`) or HeroUI parts that own them (the
 * KPI value); fine print, display and arbitrary sizes at a call site are how
 * a screen drifts off the scale.
 */
const offScaleTextSize =
    /(?<![\w-])text-(?:2xs|xs|lg|[2-9]?xl|\[(?:length:|[\d.]|calc\(|var\(--text)[^\]]*\]|\(length:[^)]*\))(?![\w-])/g;

describe('heroui composition contract', () => {
    const files = listSourceFiles(sourceRoot).map(path => ({
        content: readFileSync(path, 'utf8'),
        path: relative(sourceRoot, path),
    }));

    test('no call site cancels a HeroUI component’s own spacing', () => {
        const offenders = files
            .filter(file => cancelsSpacing(file.content))
            .filter(file => !(file.path in spacingOverrideAllowlist))
            .map(file => file.path);
        expect(offenders).toEqual([]);
    });

    test('the spacing-override allowlist stays honest', () => {
        // Entries must still exist and must still override; stale entries get
        // removed so the list only names real exceptions.
        const byPath = new Map(files.map(file => [file.path, file.content]));
        for (const path of Object.keys(spacingOverrideAllowlist)) {
            const content = byPath.get(path);
            expect(content, `${path} is allowlisted but no longer exists`).toBeDefined();
            expect(
                content !== undefined && cancelsSpacing(content),
                `${path} no longer overrides HeroUI spacing; remove its allowlist entry`
            ).toBe(true);
        }
    });

    test('no layout element sits directly in a part that lays out its own children', () => {
        const offenders = files.flatMap(file =>
            layoutChildViolations(file.content).map(part => `${file.path}: <${part}>`)
        );
        expect(offenders).toEqual([]);
    });

    test('no Form wraps a dialog’s compound parts', () => {
        const offenders = files
            .filter(file => formWrapsDialogParts(file.content))
            .map(file => file.path);
        expect(offenders).toEqual([]);
    });

    test('UI components come from HeroUI, not Base UI or lucide', () => {
        const offenders = files
            .filter(file => legacyImportPattern.test(file.content))
            .map(file => file.path);
        expect(offenders).toEqual([]);
    });

    test('text stays on the Grid type scale', () => {
        const theme = readFileSync(join(sourceRoot, 'styles/theme/tokens.css'), 'utf8');
        // Reason for the change from the 13px-only scale: the Grid J/K/I mocks the user chose.
        expect(theme).toMatch(
            /--text-base: 0\.875rem;[\s\S]*--text-sm: 0\.8125rem;[\s\S]*--text-xs: var\(--text-sm\);[\s\S]*--text-2xl: 1\.25rem;[\s\S]*--text-3xl: var\(--text-2xl\);/
        );
        const offenders = files.flatMap(file =>
            [...file.content.matchAll(offScaleTextSize)].map(match => `${file.path}: ${match[0]}`)
        );
        expect(offenders).toEqual([]);
    });

    test('the type-scale guard catches every off-scale size form', () => {
        const caught = (source: string) => [...source.matchAll(offScaleTextSize)].map(m => m[0]);
        expect(caught('className="text-xs text-2xs text-lg text-xl text-3xl"')).toEqual([
            'text-xs',
            'text-2xs',
            'text-lg',
            'text-xl',
            'text-3xl',
        ]);
        expect(caught("cn('text-[0.625rem]', 'text-[19px]', 'text-(length:--x)')")).toEqual([
            'text-[0.625rem]',
            'text-[19px]',
            'text-(length:--x)',
        ]);
        expect(caught('className="text-sm text-muted text-tier-fg text-[var(--ink)]"')).toEqual([]);
    });

    test('the JSX scanner reads class lists in every form', () => {
        expect(cancelsSpacing('<Card className="p-0">')).toBe(true);
        // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test.
        expect(cancelsSpacing('<Widget.Content className={`flex ${a} gap-0`}>')).toBe(true);
        expect(cancelsSpacing("<KPI className={cn('px-0', isOpen && 'flex')}>")).toBe(true);
        expect(cancelsSpacing('<Card onPress={() => go()} className="gap-0.5">')).toBe(false);
        expect(cancelsSpacing('<div className="p-0">')).toBe(false);
        expect(layoutChildViolations('<Widget.Header><div /></Widget.Header>')).toEqual([
            'Widget.Header',
        ]);
        expect(
            layoutChildViolations(
                '<Card.Header><Card.Title>a</Card.Title>{x ? <span>b</span> : null}</Card.Header>'
            )
        ).toEqual(['Card.Header']);
        expect(
            layoutChildViolations(
                '<Card.Header><Card.Description><span>b</span></Card.Description></Card.Header>'
            )
        ).toEqual([]);
        expect(
            layoutChildViolations(
                "<Card.Header><Tooltip.Trigger<'span'> render={p => <span {...p} />}>a</Tooltip.Trigger></Card.Header>"
            )
        ).toEqual([]);
    });
});

const className = /\bclassName=/;

const cancelsSpacing = (source: string) =>
    scanTags(source).some(tag => {
        const owner = tag.name.split('.')[0] ?? '';
        if (!(spacingOwners.has(owner) && className.test(tag.attributes))) {
            return false;
        }
        const value = tag.attributes.slice(tag.attributes.search(className));
        return cancelledSpacing.test(value);
    });

/** Parts from `layoutOwningParts` with a `div`/`span`/`section` as a direct child. */
const layoutChildViolations = (source: string) => {
    const tags = scanTags(source);
    const violations: string[] = [];
    tags.forEach((tag, start) => {
        if (!layoutOwningParts.has(tag.name) || tag.selfClosing) {
            return;
        }
        let depth = 0;
        for (const child of tags.slice(start + 1)) {
            if (child.name.startsWith('/')) {
                if (depth === 0) {
                    return;
                }
                depth -= 1;
                continue;
            }
            if (depth === 0 && layoutElements.has(child.name)) {
                violations.push(tag.name);
                return;
            }
            if (!child.selfClosing) {
                depth += 1;
            }
        }
    });
    return violations;
};

const formWrapsDialogParts = (source: string) => {
    for (const match of source.matchAll(/<Form[\s>]/g)) {
        const close = source.indexOf('</Form>', match.index);
        const body = source.slice(match.index, close === -1 ? undefined : close);
        if (dialogFooters.test(body)) {
            return true;
        }
    }
    return false;
};

const listSourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(path);
        }
        if (!sourceFilePattern.test(entry.name) || testFilePattern.test(entry.name)) {
            return [];
        }
        return [path];
    });
