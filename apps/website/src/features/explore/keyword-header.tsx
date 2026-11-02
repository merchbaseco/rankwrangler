import { Button, Skeleton, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { formatCount } from '@/features/bsr/bsr-format';
import { SeasonalityChart } from './seasonality-chart';
import { type Season, seasonPeakWeek, seasonWeekLabel } from './seasonality-geometry';

/**
 * A keyword search's page head on Explore: the keyword as the page's name (not
 * a filter chip beside others; user feedback), its design count and busiest
 * week, and its last year as one halftone line at a capped width. The close
 * button leaves the keyword for all designs; the other filters stay.
 */
export const KeywordHeader = ({
    isLoading,
    keyword,
    onLeave,
    season: read,
    total,
}: {
    isLoading: boolean;
    keyword: string;
    onLeave: () => void;
    season: Season | null;
    total: number | null;
}) => {
    const peak = read ? seasonPeakWeek(read) : null;
    // A season with no ranked week draws nothing, so it reads as no season.
    const season = peak ? read : null;
    return (
        <section aria-label={`Keyword ${keyword}`} className="keyword-header">
            <div className="keyword-header__identity">
                <span className="keyword-header__eyebrow">Keyword</span>
                <div className="keyword-header__name">
                    <h2 className="keyword-header__title" data-selectable-text>
                        {keyword}
                    </h2>
                    <Tooltip>
                        <Button
                            aria-label="Leave keyword"
                            isIconOnly
                            onPress={onLeave}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={Cancel01Icon} />
                        </Button>
                        <Tooltip.Content placement="bottom">All designs</Tooltip.Content>
                    </Tooltip>
                </div>
                <span className="keyword-header__meta">
                    <span className="grid-figure">{total === null ? '…' : formatCount(total)}</span>{' '}
                    designs
                    {peak ? <> · busiest around {seasonWeekLabel(peak.start)}</> : null}
                </span>
            </div>
            <div className="keyword-header__season">
                <div className="keyword-header__season-bar">
                    <span>Last 12 months</span>
                    <span className="keyword-header__note">
                        Weekly sales strength
                        {season ? ` · ${formatCount(season.sampled)} designs sampled` : null}
                    </span>
                </div>
                <div className="keyword-header__chart">
                    {season ? (
                        <SeasonalityChart height={chartHeight} season={season} />
                    ) : isLoading ? (
                        <Skeleton className="h-full w-full rounded-none" />
                    ) : (
                        <span className="keyword-header__note">
                            Not enough rank history yet to chart this keyword’s year.
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
};

/** The chart's drawing height in px; `.keyword-header__chart` holds the same. */
const chartHeight = 88;
