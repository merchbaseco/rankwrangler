import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCount } from './metrics/metric-format';

/** One data series' colour on the status page; `status.css` maps each to a theme token. */
export type SeriesTone = 'current' | 'due' | 'pending' | 'idle' | 'faint' | 'accent' | 'alert';

export interface Segment {
    readonly key: string;
    readonly label: string;
    readonly tone: SeriesTone;
    readonly value: number;
}

/** A status page section: a title with its caption trailing, then the content. */
export const StatusSection = ({
    caption,
    children,
    title,
}: {
    caption?: ReactNode;
    children: ReactNode;
    title: string;
}) => (
    <section aria-label={title} className="status-section">
        <header className="status-section__header">
            <h2 className="status-section__title">{title}</h2>
            {caption ? <span className="status-section__caption">{caption}</span> : null}
        </header>
        {children}
    </section>
);

/** A bordered card holding one panel when a section sets two side by side. */
export const StatusCard = ({
    aside,
    children,
    title,
}: {
    aside?: ReactNode;
    children: ReactNode;
    title: string;
}) => (
    <div className="status-card">
        <div className="status-card__header">
            <h3 className="status-card__title">{title}</h3>
            {aside ? <span className="status-card__aside">{aside}</span> : null}
        </div>
        {children}
    </div>
);

/**
 * The headline figures: the first is the big number, the rest sit beside it smaller. A figure
 * with `of` reads as "864 of 1,200".
 */
export const Headline = ({
    figures,
}: {
    figures: ReadonlyArray<{
        readonly label: string;
        readonly of?: number | null;
        readonly value: number | null;
        readonly prefix?: string;
        readonly suffix?: string;
    }>;
}) => (
    <dl className="status-headline">
        {figures.map((figure, index) => (
            <div
                className={cn('status-figure', index === 0 && 'status-figure--lead')}
                key={figure.label}
            >
                <dt className="status-figure__label">{figure.label}</dt>
                <dd className="status-figure__value">
                    {figure.value === null
                        ? '—'
                        : `${figure.prefix ?? ''}${formatCount(figure.value)}${figure.suffix ?? ''}`}
                    {figure.of != null ? (
                        <span className="status-figure__of"> of {formatCount(figure.of)}</span>
                    ) : null}
                </dd>
            </div>
        ))}
    </dl>
);

/**
 * A horizontal bar split into its segments, proportional to their values over `total` (the
 * segments' sum by default; a larger total leaves the rest as track). `marker` draws a tick at a
 * fraction of the bar, such as a reserve line.
 */
export const SegmentedBar = ({
    label,
    marker,
    segments,
    size = 'lg',
    total,
}: {
    label: string;
    marker?: { readonly at: number; readonly label: string };
    segments: readonly Segment[];
    size?: 'lg' | 'sm';
    total?: number | null;
}) => {
    const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
    const whole = Math.max(total ?? sum, sum);
    return (
        <div
            aria-label={`${label}: ${describe(segments)}`}
            className={cn('status-bar', `status-bar--${size}`)}
            role="img"
        >
            {whole > 0
                ? segments
                      .filter(segment => segment.value > 0)
                      .map(segment => (
                          <span
                              className={cn('status-bar__segment', `status-tone--${segment.tone}`)}
                              key={segment.key}
                              style={{ flexGrow: segment.value }}
                          />
                      ))
                : null}
            {whole > sum ? (
                <span className="status-bar__rest" style={{ flexGrow: whole - sum }} />
            ) : null}
            {marker ? (
                <span
                    aria-hidden
                    className="status-bar__marker"
                    style={{ insetInlineStart: `${marker.at * 100}%` }}
                    title={marker.label}
                />
            ) : null}
        </div>
    );
};

/** The bar's key: a swatch, the series name and its count, wrapping on narrow widths. */
export const Legend = ({ segments }: { segments: readonly Segment[] }) => (
    <ul className="status-legend">
        {segments.map(segment => (
            <li className="status-legend__item" key={segment.key}>
                <span aria-hidden className={cn('status-swatch', `status-tone--${segment.tone}`)} />
                {segment.label}
                <span className="status-legend__value">{formatCount(segment.value)}</span>
            </li>
        ))}
    </ul>
);

const describe = (segments: readonly Segment[]) =>
    segments.map(segment => `${segment.label} ${formatCount(segment.value)}`).join(', ');
