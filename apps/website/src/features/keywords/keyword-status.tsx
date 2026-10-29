import { Spinner, Tooltip } from '@heroui/react';
import { cn } from '@/lib/utils';
import { formatAgo, idleStageNotes, type KeywordRow } from './keyword-model';

/**
 * A keyword's stage and freshness (docs/internals/keyword-mining.md) as Grid
 * I's two lines. Graduated keywords read their freshness: Live (green dot,
 * time since the check), Needs sync (grey dot) or Syncing (accent spinner).
 * A trial reads as its qualification check: Awaiting check or Checking.
 * Dropped and untracked keywords show a hollow dot with why. Text always
 * carries the state; colour only reinforces it, and a tooltip adds detail.
 */
export const KeywordStatus = ({ row }: { row: KeywordRow }) => {
    const { detail, dot, label, title } = describe(row);
    const status = (
        <span className="status-cell">
            {dot === 'syncing' ? (
                <Spinner color="accent" size="sm" />
            ) : (
                <span aria-hidden className={cn('status-dot', `status-dot--${dot}`)} />
            )}
            <span className="status-cell__text">
                <span>{label}</span>
                {detail ? <span className="status-cell__detail">{detail}</span> : null}
            </span>
        </span>
    );
    if (!title) {
        return status;
    }
    return (
        <Tooltip>
            <Tooltip.Trigger<'span'> render={props => <span {...props} />}>
                {status}
            </Tooltip.Trigger>
            <Tooltip.Content>{title}</Tooltip.Content>
        </Tooltip>
    );
};

type Dot = 'live' | 'needs-sync' | 'syncing' | 'idle';

const describe = (
    row: KeywordRow
): { dot: Dot; label: string; detail?: string; title?: string } => {
    switch (row.stage) {
        case 'graduated':
            return describeFreshness(row);
        case 'trial':
            return describeTrial(row);
        case 'dropped':
        case 'untracked': {
            const note = idleStageNotes[row.stage];
            return {
                detail: note,
                dot: 'idle',
                label: row.stage === 'dropped' ? 'Dropped' : 'Untracked',
                title: note,
            };
        }
        default: {
            const exhaustive: never = row.stage;
            return { dot: 'idle', label: String(exhaustive) };
        }
    }
};

const describeFreshness = (row: KeywordRow) => {
    const ago = formatAgo(row.lastCheckedAt);
    const retry = row.retryScheduled ? 'Retry scheduled' : undefined;
    switch (row.freshness) {
        case 'syncing':
            return {
                detail: ago ? `last checked ${ago}` : undefined,
                dot: 'syncing' as const,
                label: 'Syncing',
            };
        case 'live':
            return {
                detail: ago ?? undefined,
                dot: 'live' as const,
                label: 'Live',
                title: row.lastCheckedAt
                    ? `Checked ${new Date(row.lastCheckedAt).toLocaleString()}`
                    : undefined,
            };
        default:
            return {
                detail: retry ? 'retry scheduled' : ago ? `checked ${ago}` : undefined,
                dot: 'needs-sync' as const,
                label: 'Needs sync',
                title: retry,
            };
    }
};

/** A trial only ever awaits or undergoes its first-page check. */
const describeTrial = (row: KeywordRow) => {
    const rank =
        row.searchFrequencyRank === null
            ? undefined
            : `Brand Analytics #${row.searchFrequencyRank.toLocaleString('en-US')}`;
    if (row.freshness === 'syncing') {
        return { detail: 'trial', dot: 'syncing' as const, label: 'Checking', title: rank };
    }
    return {
        detail: row.retryScheduled ? 'trial · retry scheduled' : 'trial',
        dot: 'needs-sync' as const,
        label: 'Awaiting check',
        title: rank,
    };
};
