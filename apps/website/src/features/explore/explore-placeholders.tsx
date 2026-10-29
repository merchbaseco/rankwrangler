import { Button, Spinner } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';

/** Loading: one spinner where the rows will be; the table keeps its header. */
export const ExploreLoading = () => <Spinner size="sm" />;

/**
 * Nothing matched: say why in one line and offer the one fix that always
 * works. A failed read says it failed instead of claiming an empty catalog.
 */
export const ExploreEmpty = ({
    error,
    onClear,
}: {
    error: { data?: { code?: string } | null } | null;
    onClear: (() => void) | null;
}) => (
    <EmptyState size="sm">
        <EmptyState.Header>
            <EmptyState.Media variant="icon">
                <Icon icon={Search01Icon} />
            </EmptyState.Media>
            <EmptyState.Title>
                {error ? 'Products did not load' : 'No designs match'}
            </EmptyState.Title>
            <EmptyState.Description>
                {error
                    ? describeError(error.data?.code)
                    : 'Try a broader keyword or fewer filters.'}
            </EmptyState.Description>
        </EmptyState.Header>
        {onClear && !error ? (
            <EmptyState.Content>
                <Button onPress={onClear} size="sm" variant="secondary">
                    Clear filters
                </Button>
            </EmptyState.Content>
        ) : null}
    </EmptyState>
);

const describeError = (code: string | undefined) => {
    switch (code) {
        case 'UNAUTHORIZED':
            return 'The server rejected this session.';
        case 'FORBIDDEN':
            return 'RankWrangler access is not granted for this account.';
        case 'SERVICE_UNAVAILABLE':
            return 'Access checks are temporarily unavailable. Retry shortly.';
        default:
            return 'The product search failed. Retry shortly.';
    }
};
