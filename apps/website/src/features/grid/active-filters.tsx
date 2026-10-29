import { Button, type Key, Tag, TagGroup } from '@heroui/react';
import { KPI } from '@heroui-pro/react/kpi';
import type { ReactNode } from 'react';

/** One active filter: its tag text and its id, which the screen maps back to a removal. */
export interface ActiveFilter {
    readonly id: string;
    readonly label: string;
}

/**
 * The KPI header's first cell (over the name columns, HeadO): a label line,
 * then the results' mix bar (`mix`), then the hatch. The label line is the
 * mix's name and result count (`summary`) until filters are set; then it
 * holds the filters in force as removable stock Tags and a Clear button.
 */
export const ActiveFiltersCell = ({
    actions,
    filters,
    mix,
    onClear,
    onRemove,
    summary,
}: {
    /** A trailing control (Track, the narrow-screen Filters button). */
    actions?: ReactNode;
    filters: readonly ActiveFilter[];
    /** The results' mix bar (`MixBar`). */
    mix?: ReactNode;
    onClear: () => void;
    onRemove: (ids: readonly string[]) => void;
    /** The label line with nothing filtered: the mix's name and the result count. */
    summary?: ReactNode;
}) => (
    <KPI className="grid-kpi grid-kpi--results">
        {filters.length > 0 || actions || summary ? (
            <KPI.Header>
                {filters.length === 0 ? summary : null}
                {filters.length > 0 ? (
                    <TagGroup
                        aria-label="Active filters"
                        className="active-filters"
                        onRemove={(keys: Set<Key>) => onRemove([...keys].map(String))}
                        size="sm"
                    >
                        <TagGroup.List items={filters}>
                            {filter => (
                                <Tag id={filter.id} textValue={filter.label}>
                                    {filter.label}
                                </Tag>
                            )}
                        </TagGroup.List>
                    </TagGroup>
                ) : null}
                {filters.length > 0 ? (
                    <Button onPress={onClear} size="sm" variant="ghost">
                        Clear
                    </Button>
                ) : null}
                {actions}
            </KPI.Header>
        ) : null}
        {mix ? <KPI.Content>{mix}</KPI.Content> : null}
        <span aria-hidden className="grid-kpi__hatch" />
    </KPI>
);

/** The label line's default: the mix's name muted, the result count trailing. */
export const MixSummary = ({
    count,
    label,
    noun,
}: {
    count: number | null;
    label: string;
    noun: string;
}) => (
    <span className="mix-summary">
        <KPI.Title>{label}</KPI.Title>
        <span className="mix-summary__count">
            {count === null ? (
                '…'
            ) : (
                <span className="grid-figure">{count.toLocaleString('en-US')}</span>
            )}{' '}
            {noun}
        </span>
    </span>
);
