import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShellSearch } from '@/features/shell/shell-search';
import { useSubmitSearchInterest } from '@/features/shell/use-submit-search-interest';

/**
 * The banner search on a Product page: a product has nothing to filter,
 * so it searches designs and Enter opens Explore's results for the phrase.
 */
export const ProductSearch = () => {
    const navigate = useNavigate();
    const submit = useSubmitSearchInterest();
    const openResults = useCallback(
        (value: string) => {
            const q = value.trim();
            submit(q);
            navigate(q ? `/explore?${new URLSearchParams({ q })}` : '/explore');
        },
        [navigate, submit]
    );
    return (
        <ShellSearch
            label="Search designs"
            onChange={ignoreDraft}
            onSubmit={openResults}
            placeholder="Search designs, brands, ASINs"
            value=""
        />
    );
};

/** Typing alone stays on the page; only Enter leaves for Explore. */
const ignoreDraft = () => {};
