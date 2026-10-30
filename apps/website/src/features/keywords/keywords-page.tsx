import { Button, type Selection, Tooltip } from '@heroui/react';
import { DataGrid, type DataGridSortDescriptor } from '@heroui-pro/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/icon';
import { GridDensityToggle } from '@/features/grid/grid-density-toggle';
import { GridPager } from '@/features/grid/grid-pager';
import {
    gridPlaceholderRows,
    isGridPlaceholder,
    withGridPlaceholders,
} from '@/features/grid/grid-placeholders';
import { GridRowLinks } from '@/features/grid/grid-row-links';
import { GridScreen } from '@/features/grid/grid-screen';
import { exploreKeywordHref } from '@/features/product/product-keyword-links';
import { ShellSearch } from '@/features/shell/shell-search';
import { useRowCursor } from '@/features/shell/use-row-cursor';
import { keywordRowIdAttribute } from './keyword-cells';
import { keywordColumns, keywordSortDescriptor, keywordSortForColumn } from './keyword-columns';
import { KeywordEmptyState } from './keyword-empty-state';
import { isKeywordFiltered, keywordPageSizes } from './keyword-filters';
import { KeywordKpis } from './keyword-kpis';
import { isTrackable, normalizeTerm } from './keyword-model';
import { KeywordRowMenu } from './keyword-row-menu';
import { KeywordSidebar } from './keyword-sidebar';
import { useKeywordDirectory } from './use-keyword-directory';
import { useKeywordFacets } from './use-keyword-facets';
import { useKeywordFilters } from './use-keyword-filters';
import { useKeywordTrack } from './use-keyword-track';

/**
 * Keywords (`/keywords`, Grid I): the filter sidebar, the KPI header and one
 * page of the mined-keyword directory with a pager, all bound to the URL.
 * Realtime directory events patch the page in place. ⏎ in the search tracks
 * a new phrase; a click or ⏎ on a row opens Explore's results for it; `t`
 * tracks a dropped or untracked row; right-click opens the row menu.
 */
export const KeywordsPage = () => {
    const navigate = useNavigate();
    const { filters, update } = useKeywordFilters();
    const directory = useKeywordDirectory(filters);
    const facets = useKeywordFacets(filters);
    const tracking = useKeywordTrack();
    const [cursorId, setCursorId] = useState<string | null>(null);
    const rows = directory.rows;
    const ids = useMemo(() => rows.map(row => row.id), [rows]);
    const cursor = rows.some(row => row.id === cursorId) ? cursorId : null;

    const term = normalizeTerm(filters.q);
    const isKnown = (candidate: string) => rows.some(row => row.term === candidate);
    const canTrack = term.length > 0 && !directory.isLoading && !isKnown(term);
    const trackTerm = () => {
        if (canTrack) {
            tracking.track(term);
        }
    };
    // ⏎ in the search tracks what was typed, settled or not.
    const trackSubmitted = (value: string) => {
        const submitted = normalizeTerm(value);
        if (submitted.length > 0 && !directory.isLoading && !isKnown(submitted)) {
            tracking.track(submitted);
        }
    };
    const hrefOf = (id: string) => {
        const row = rows.find(candidate => candidate.id === id);
        return row ? exploreKeywordHref(row.term) : undefined;
    };
    const openResults = (id: string) => {
        const href = hrefOf(id);
        if (href) {
            navigate(href);
        }
    };
    const trackRow = (id: string) => {
        const row = rows.find(candidate => candidate.id === id);
        if (row && isTrackable(row)) {
            tracking.track(row.term);
        }
    };
    useRowCursor({
        attribute: keywordRowIdAttribute,
        ids,
        keys: { t: trackRow },
        onOpen: openResults,
        onSelect: setCursorId,
        selectedId: cursor,
    });

    const handleSearch = useCallback((q: string) => update({ q }), [update]);
    const handleSortChange = ({ column }: DataGridSortDescriptor) => {
        const sort = keywordSortForColumn(column, filters.sort);
        if (sort) {
            update({ sort });
        }
    };
    const handleSelectionChange = (selection: Selection) => {
        const [first] = selection === 'all' ? [] : [...selection];
        setCursorId(first === undefined ? null : String(first));
    };
    const trackError = tracking.error ? `Couldn’t track: ${tracking.error.message}` : null;

    return (
        <GridScreen
            filters={<KeywordSidebar facets={facets} filters={filters} onChange={update} />}
            label="Keywords"
        >
            <ShellSearch
                label="Search keywords"
                onChange={handleSearch}
                onSubmit={trackSubmitted}
                placeholder="Search keywords"
                value={filters.q}
            />
            <KeywordKpis
                facets={facets}
                filters={filters}
                onChange={update}
                track={
                    canTrack ? (
                        <Tooltip>
                            <Button
                                isPending={tracking.isPending}
                                onPress={trackTerm}
                                size="sm"
                                variant="secondary"
                            >
                                <Icon icon={Add01Icon} />
                                Track “{filters.q.trim()}”
                            </Button>
                            <Tooltip.Content placement="bottom">
                                {trackError ?? 'Start collecting this keyword'}
                            </Tooltip.Content>
                        </Tooltip>
                    ) : null
                }
            />
            <KeywordRowMenu onTrack={tracking.track} rows={rows}>
                <GridRowLinks hrefOf={hrefOf}>
                    <DataGrid
                        aria-label="Keyword directory"
                        className="hairline-grid hairline-grid--fixed hairline-grid--fill"
                        columns={columns}
                        data={directory.isLoading ? gridPlaceholderRows(filters.pageSize) : rows}
                        getRowId={row => (isGridPlaceholder(row) ? row.placeholderId : row.id)}
                        onRowAction={key => openResults(String(key))}
                        onSelectionChange={handleSelectionChange}
                        onSortChange={handleSortChange}
                        renderEmptyState={() => (
                            <KeywordEmptyState
                                hasError={Boolean(directory.error)}
                                hasFacet={isKeywordFiltered({ ...filters, q: '' })}
                                isTracking={tracking.isPending}
                                onRetry={() => {
                                    directory.refetch().catch((error: unknown) => {
                                        console.error('Reloading keywords failed', error);
                                    });
                                }}
                                onTrack={canTrack ? trackTerm : null}
                                search={filters.q.trim()}
                                trackError={trackError}
                            />
                        )}
                        scrollContainerClassName="overflow-y-auto"
                        selectedKeys={cursor ? new Set([cursor]) : new Set()}
                        // Toggle behaviour: a click (or ⏎) is the row action; j/k set the cursor.
                        selectionBehavior="toggle"
                        selectionMode="single"
                        sortDescriptor={keywordSortDescriptor(filters.sort)}
                        variant="secondary"
                    />
                </GridRowLinks>
            </KeywordRowMenu>
            <GridPager
                extra={<GridDensityToggle />}
                onPageChange={page => update({ page })}
                onPageSizeChange={pageSize => update({ pageSize })}
                page={filters.page}
                pageSize={filters.pageSize}
                pageSizes={keywordPageSizes}
                rowCount={rows.length}
                total={directory.total}
            />
        </GridScreen>
    );
};

const columns = withGridPlaceholders(keywordColumns);
