import { ToggleButton } from '@heroui/react';
import type { CSSProperties } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatCount } from '@/features/bsr/bsr-format';
import { mixShares } from '@/features/bsr/mix-geometry';
import { cn } from '@/lib/utils';

/**
 * One part of a mix: its filter key, label, count and colour scope (`tier-hot`). A null count is
 * not loaded yet: the bar keeps its layout with an empty track.
 */
export interface MixPart<K extends string> {
    readonly key: K;
    readonly label: string;
    readonly count: number | null;
    readonly scope: string;
}

/**
 * A stacked mix bar over its legend (HeadO): the current results split by
 * tier (or heat) in their colours, widths proportional with a visible
 * minimum. Every segment and legend item is a stock ToggleButton for that
 * part's filter (keyboard reachable, `aria-pressed`); hovering one raises it,
 * dims the rest and names it in a cursor tooltip; chosen parts stay raised.
 */
export const MixBar = <K extends string>({
    label,
    noun,
    onToggle,
    parts,
    selected,
}: {
    /** Names the bar for assistive tech, e.g. `Tier mix`. */
    label: string;
    /** What a count counts, singular and plural: `['design', 'designs']`. */
    noun: readonly [string, string];
    onToggle: (key: K) => void;
    parts: readonly MixPart<K>[];
    selected: ReadonlySet<K>;
}) => {
    const shares = mixShares(parts.map(part => part.count ?? 0));
    const describe = (part: MixPart<K>) =>
        `${part.label} · ${formatCount(part.count)} ${part.count === 1 ? noun[0] : noun[1]} · ${
            selected.has(part.key) ? 'click to remove' : 'click to filter'
        }`;
    return (
        <fieldset aria-label={label} className="mix-bar">
            <div className="mix-bar__track">
                {parts.map((part, index) =>
                    shares[index] ? (
                        <span
                            className={cn('mix-bar__slot', part.scope)}
                            key={part.key}
                            style={{ '--mix-share': shares[index] } as CSSProperties}
                        >
                            <CursorTooltip content={describe(part)} triggerClassName="flex w-full">
                                <ToggleButton
                                    aria-label={describe(part)}
                                    className={cn(
                                        'mix-bar__segment',
                                        // With parts chosen, the unchosen ones recede.
                                        selected.size > 0 &&
                                            !selected.has(part.key) &&
                                            'mix-bar__segment--dim'
                                    )}
                                    isSelected={selected.has(part.key)}
                                    onChange={() => onToggle(part.key)}
                                />
                            </CursorTooltip>
                        </span>
                    ) : null
                )}
            </div>
            <div className="mix-bar__legend">
                {parts.map(part => (
                    <ToggleButton
                        aria-label={describe(part)}
                        className={cn('mix-bar__key', part.scope)}
                        isSelected={selected.has(part.key)}
                        key={part.key}
                        onChange={() => onToggle(part.key)}
                        size="sm"
                    >
                        <span aria-hidden className="mix-bar__dot" />
                        {part.label}
                        <span className="mix-bar__count">{formatCount(part.count)}</span>
                    </ToggleButton>
                ))}
            </div>
        </fieldset>
    );
};
