import { Kbd, SearchField } from '@heroui/react';
import { PageToolbar } from './page-toolbar';
import { useSearchDraft } from './use-search-draft';
import { useSearchFocusShortcut } from './use-search-focus-shortcut';

/**
 * The banner's search (Grid J/K/I), shared by every page: a stock SearchField
 * whose placeholder names what that page searches. The grid's KPI header,
 * not the field, says how many rows there are.
 * Typing stays local and reaches the page once it settles (useSearchDraft);
 * Enter pushes it at once and runs `onSubmit` (Keywords tracks the phrase,
 * Product opens Explore's results). ⌘K or `/` focuses it from anywhere.
 */
export const ShellSearch = ({
    label,
    onChange,
    onSubmit,
    placeholder,
    value,
}: {
    label: string;
    /** What this page searches, e.g. `Search designs, brands, ASINs`. */
    placeholder: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    value: string;
}) => {
    const search = useSearchDraft(value, onChange);
    useSearchFocusShortcut(inputSelector);
    return (
        <PageToolbar>
            <SearchField
                aria-label={label}
                className="banner-search"
                fullWidth
                variant="secondary"
                onChange={search.onChange}
                onFocusChange={search.onFocusChange}
                onSubmit={submitted => {
                    search.flush(submitted);
                    onSubmit?.(submitted);
                }}
                value={search.draft}
            >
                <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input className="min-w-0" placeholder={placeholder} />
                    <span aria-hidden className="banner-search__keys">
                        <Kbd>
                            <Kbd.Abbr keyValue="command" />
                        </Kbd>
                        <Kbd>
                            <Kbd.Content>K</Kbd.Content>
                        </Kbd>
                    </span>
                </SearchField.Group>
            </SearchField>
        </PageToolbar>
    );
};

const inputSelector = '.banner-search input';
