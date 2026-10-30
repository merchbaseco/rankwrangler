import { failureFigures, ProviderVerdictChip } from './provider-verdict';
import { RefreshTierTable } from './refresh-tier-table';
import {
    formatCount,
    formatPercent,
    fraction,
    keepaWorkLabels,
    type RefreshTiers,
    type SystemStatus,
    spApiOperationUsage,
} from './status-model';
import {
    Headline,
    Legend,
    type Segment,
    type SeriesTone,
    SegmentedBar,
    StatusBlock,
    StatusCard,
    StatusSection,
} from './status-panel';

/**
 * One column per provider: the last hour's usage against its allowance, the last day's throttles
 * and errors, and beneath them the refresh tiers that decide when it is called.
 */
export const StatusProviders = ({
    status,
    tiers,
}: {
    status: SystemStatus;
    tiers: RefreshTiers | undefined;
}) => (
    <div className="status-pair status-pair--top">
        <KeepaSection status={status} tiers={tiers?.keepa} />
        <SpApiSection status={status} tiers={tiers?.spApi} />
    </div>
);

/** Keepa: tokens spent in the last hour against the hour's refill, by what they went to. */
const KeepaSection = ({
    status,
    tiers,
}: {
    status: SystemStatus;
    tiers: RefreshTiers['keepa'] | undefined;
}) => {
    const { keepa } = status;
    const segments = toSegments(
        keepa.spentLastHour.map(row => ({
            key: row.workClass,
            label: keepaWorkLabels[row.workClass] ?? row.workClass,
            value: Math.round(row.tokens),
        }))
    );
    const used = segments.reduce((sum, segment) => sum + segment.value, 0);
    return (
        <StatusSection
            caption={<ProviderVerdictChip provider="keepa" status={status} />}
            title="Keepa"
        >
            <StatusCard>
                <StatusBlock aside={keepaAside(keepa)} title="Token allowance · 1h">
                    <Headline
                        figures={[
                            {
                                display:
                                    keepa.capacity === null
                                        ? '—'
                                        : formatPercent(fraction(used, keepa.capacity)),
                                label: 'Used',
                                value: used,
                            },
                            ...failureFigures(status, 'keepa'),
                        ]}
                    />
                    <SegmentedBar
                        label="Keepa tokens spent in the last hour"
                        segments={segments}
                        total={keepa.capacity}
                    />
                    <Legend segments={segments} />
                </StatusBlock>
                <RefreshTierTable label="Keepa refresh tiers" tiers={tiers} />
            </StatusCard>
        </StatusSection>
    );
};

/** SP-API: each operation's last hour against its own rate limit, the busiest one leading. */
const SpApiSection = ({
    status,
    tiers,
}: {
    status: SystemStatus;
    tiers: RefreshTiers['spApi'] | undefined;
}) => {
    const operations = spApiOperationUsage(status);
    const busiest = Math.max(
        0,
        ...operations.map(row =>
            row.hourlyLimit === null ? 0 : fraction(row.calls1h, row.hourlyLimit)
        )
    );
    return (
        <StatusSection
            caption={<ProviderVerdictChip provider="spapi" status={status} />}
            title="SP-API"
        >
            <StatusCard>
                <StatusBlock aside="Each call against its own limit" title="Rate limits · 1h">
                    <Headline
                        figures={[
                            { display: formatPercent(busiest), label: 'Busiest limit', value: 0 },
                            ...failureFigures(status, 'spapi'),
                        ]}
                    />
                    <dl className="status-rows">
                        {operations.map(row => (
                            <div className="status-row" key={row.operation}>
                                <dt className="truncate">{row.label}</dt>
                                <dd className="status-row__bar">
                                    <SegmentedBar
                                        label={`${row.label} calls in the last hour`}
                                        segments={[
                                            {
                                                key: row.operation,
                                                label: row.label,
                                                tone: 'current',
                                                value: row.calls1h,
                                            },
                                        ]}
                                        size="sm"
                                        total={row.hourlyLimit}
                                    />
                                </dd>
                                <dd className="status-row__value">
                                    {formatCount(row.calls1h)}
                                    <span className="text-muted">
                                        {row.hourlyLimit === null
                                            ? ''
                                            : ` / ${formatCount(row.hourlyLimit)}`}
                                    </span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </StatusBlock>
                <RefreshTierTable label="SP-API refresh tiers" tiers={tiers} />
            </StatusCard>
        </StatusSection>
    );
};

const keepaAside = (keepa: SystemStatus['keepa']) => {
    if (keepa.refillRate === null) {
        return 'Awaiting first observation';
    }
    const left = keepa.tokensLeft === null ? '—' : formatCount(Math.round(keepa.tokensLeft));
    return `${left} left · ${formatCount(keepa.refillRate)}/min`;
};

const breakdownTones: readonly SeriesTone[] = ['current', 'accent', 'pending', 'due', 'idle'];

const toSegments = (
    rows: ReadonlyArray<{ readonly key: string; readonly label: string; readonly value: number }>
): Segment[] =>
    rows.map((row, index) => ({
        ...row,
        tone: breakdownTones[index % breakdownTones.length] ?? 'idle',
    }));
