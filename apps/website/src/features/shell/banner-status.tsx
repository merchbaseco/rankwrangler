import { Button, Chip, Tooltip } from '@heroui/react';
import { useLocation } from 'react-router-dom';
import { useKeywordScanCounts } from '@/features/keywords/use-keyword-scan-counts';
import { useSyncControl } from '@/features/keywords/use-sync-control';
import { cn } from '@/lib/utils';

/**
 * The banner's one live cell (Grid J/I status pill), from real data only:
 * automatic keyword sync (`syncControl`) everywhere, and on Keywords the
 * keywords scanning right now (`keyword.directoryFacets`). Admins get the
 * pill as the pause/resume control (instantly reversible, so no confirm);
 * everyone else reads it. Hidden until the sync state is known.
 */
export const BannerStatus = () => {
    const { pathname } = useLocation();
    const sync = useSyncControl();
    const scan = useKeywordScanCounts(pathname.startsWith('/keywords'));
    if (sync.paused === null) {
        return null;
    }
    const scanning = scan?.syncing ?? 0;
    const state = sync.paused ? 'paused' : scanning > 0 ? 'scanning' : 'on';
    const label = {
        on: 'Keyword sync on',
        paused: 'Keyword sync paused',
        scanning: `Keyword scan running · ${scanning.toLocaleString('en-US')}`,
    }[state];
    const content = (
        <>
            <span aria-hidden className={cn('status-dot', `status-dot--${state}`)} />
            {label}
        </>
    );
    if (!sync.canManage) {
        return (
            <span className="whitespace-nowrap max-md:hidden">
                <Chip size="lg" variant="secondary">
                    {content}
                </Chip>
            </span>
        );
    }
    const explanation = sync.paused
        ? 'Resume automatic keyword mining.'
        : 'Pause automatic keyword mining. Tracked keywords stay; nothing new is claimed.';
    return (
        <Tooltip>
            <Button
                className="max-md:hidden"
                isPending={sync.isPending}
                onPress={() => sync.setPaused(!sync.paused)}
                size="sm"
                variant="outline"
            >
                {content}
            </Button>
            <Tooltip.Content placement="bottom">
                {sync.error ? `Couldn’t change sync: ${sync.error.message}` : explanation}
            </Tooltip.Content>
        </Tooltip>
    );
};
