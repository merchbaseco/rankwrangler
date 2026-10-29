import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type ExploreFilters, parseExploreFilters, writeExploreFilters } from './explore-filters';

/** Explore's filters, read from and written to the URL (replace, not push). */
export const useExploreFilters = () => {
    const [params, setParams] = useSearchParams();
    const filters = useMemo(() => parseExploreFilters(params), [params]);
    const update = useCallback(
        (patch: Partial<ExploreFilters>) => {
            setParams(current => writeExploreFilters(current, patch), { replace: true });
        },
        [setParams]
    );
    return { filters, update };
};
