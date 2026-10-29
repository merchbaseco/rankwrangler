import { Kbd, ScrollShadow } from '@heroui/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The pane layout's building blocks (Product, Logs). A screen is a
 * row of panes separated by 1px hairlines (`TermScreen`); each pane opens with
 * a 24px title line (`PaneBar`: bold name, a filter or context summary, and
 * trailing hints) and may close with one (`edge="bottom"`).
 */
export const TermScreen = ({ children }: { children: ReactNode }) => (
    <div className="term-screen">{children}</div>
);

export const Pane = ({
    children,
    className,
    label,
}: {
    children: ReactNode;
    /** Layout only: width, flex, visibility per breakpoint. */
    className?: string;
    label: string;
}) => (
    <section aria-label={label} className={cn('term-pane', className)}>
        {children}
    </section>
);

export const PaneBar = ({
    children,
    edge = 'top',
    title,
}: {
    children?: ReactNode;
    edge?: 'top' | 'bottom';
    /** The pane's name in bold ink, e.g. `EXPLORE`. */
    title?: ReactNode;
}) => (
    <div className={cn('pane-bar', edge === 'bottom' && 'pane-bar--bottom')}>
        {title ? <span className="pane-bar__title">{title}</span> : null}
        {children}
    </div>
);

/**
 * A pane's scrolling body: a stock ScrollShadow (the edge fade says there is
 * more) around the padded content column.
 */
export const PaneBody = ({ children, className }: { children: ReactNode; className?: string }) => (
    <ScrollShadow className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn('pane-body', className)}>{children}</div>
    </ScrollShadow>
);

/**
 * A pane bar's filter row: a horizontal ScrollShadow, so chips that do not fit
 * scroll under an edge fade instead of being clipped mid-word.
 */
export const PaneFilters = ({
    children,
    fill = false,
}: {
    children: ReactNode;
    /** Take the bar's free width (the filters own the trailing controls). */
    fill?: boolean;
}) => (
    <ScrollShadow
        className={cn('pane-filters-scroll min-w-0', fill && 'flex-1')}
        hideScrollBar
        orientation="horizontal"
        size={24}
    >
        {children}
    </ScrollShadow>
);

/** Pushes the rest of a pane bar to its trailing edge. */
export const PaneBarSpacer = () => <span aria-hidden className="flex-1" />;

/** A key and what it does, e.g. `⏎ open`, for pane bars and footers. */
export const KeyHint = ({
    children,
    isDisabled = false,
    keyLabel,
}: {
    children: ReactNode;
    isDisabled?: boolean;
    keyLabel: string;
}) => (
    <span className={cn('key-hint', isDisabled && 'opacity-50')}>
        <Kbd>
            <Kbd.Content>{keyLabel}</Kbd.Content>
        </Kbd>
        {children}
    </span>
);

/** A label and figure row in a pane's key/value grid (mock `.kv`). */
export const KeyValue = ({
    children,
    className,
    label,
}: {
    children: ReactNode;
    className?: string;
    label: string;
}) => (
    <div className={cn('key-value', className)}>
        <dt>{label}</dt>
        <dd data-selectable-text>{children}</dd>
    </div>
);
