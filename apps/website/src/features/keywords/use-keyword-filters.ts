import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type KeywordFilters, parseKeywordFilters, writeKeywordFilters } from './keyword-filters';

/** The Keywords grid's filters, read from and written to the URL (replace, not push). */
export const useKeywordFilters = () => {
    const [params, setParams] = useSearchParams();
    const filters = useMemo(() => parseKeywordFilters(params), [params]);
    const update = useCallback(
        (patch: Partial<KeywordFilters>) => {
            setParams(current => writeKeywordFilters(current, patch), { replace: true });
        },
        [setParams]
    );
    return { filters, update };
};
