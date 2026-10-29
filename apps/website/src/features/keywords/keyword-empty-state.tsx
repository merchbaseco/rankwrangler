import { Button, Spinner } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { Add01Icon, Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';

/**
 * The table's empty body. A search with no match offers to track the phrase,
 * since an unknown keyword is the common reason; a failed read says it failed.
 */
export const KeywordEmptyState = ({
    hasError,
    hasFacet,
    isLoading,
    isTracking,
    onRetry,
    onTrack,
    search,
    trackError,
}: {
    hasError: boolean;
    hasFacet: boolean;
    isLoading: boolean;
    isTracking: boolean;
    onRetry: () => void;
    onTrack: (() => void) | null;
    search: string;
    trackError: string | null;
}) => {
    if (isLoading) {
        return <Spinner size="sm" />;
    }
    if (hasError) {
        return (
            <EmptyState size="sm">
                <EmptyState.Header>
                    <EmptyState.Title>Keywords did not load</EmptyState.Title>
                    <EmptyState.Description>The server did not answer.</EmptyState.Description>
                </EmptyState.Header>
                <EmptyState.Content>
                    <Button onPress={onRetry} size="sm" variant="secondary">
                        Retry
                    </Button>
                </EmptyState.Content>
            </EmptyState>
        );
    }
    return (
        <EmptyState size="sm">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={Search01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>
                    {search ? `“${search}” isn’t tracked yet` : 'No keywords here yet'}
                </EmptyState.Title>
                <EmptyState.Description>
                    {trackError ?? describe(search, hasFacet)}
                </EmptyState.Description>
            </EmptyState.Header>
            {onTrack ? (
                <EmptyState.Content>
                    <Button isPending={isTracking} onPress={onTrack} size="sm">
                        <Icon icon={Add01Icon} />
                        Track keyword
                    </Button>
                </EmptyState.Content>
            ) : null}
        </EmptyState>
    );
};

const describe = (search: string, hasFacet: boolean) => {
    if (search) {
        return hasFacet
            ? 'Nothing in this niche matches. Track it to add it to the crawl.'
            : 'Track it and the crawler will mine its search results.';
    }
    return hasFacet
        ? 'No mined keyword leans to this niche yet.'
        : 'Mined keywords appear here as the crawler finds them.';
};
