import { ShellSearch } from '@/features/shell/shell-search';
import { useSubmitSearchInterest } from '@/features/shell/use-submit-search-interest';

/**
 * Explore's use of the banner search: designs by keyword, brand or ASIN.
 * The value is the URL's `?q=`.
 * Typing only filters; ⏎ also records the phrase as a tracked keyword.
 */
export const ExploreSearch = ({
    onChange,
    value,
}: {
    onChange: (value: string) => void;
    value: string;
}) => {
    const submit = useSubmitSearchInterest();
    return (
        <ShellSearch
            label="Search designs"
            onChange={onChange}
            onSubmit={submit}
            placeholder="Search designs, brands, ASINs"
            value={value}
        />
    );
};
