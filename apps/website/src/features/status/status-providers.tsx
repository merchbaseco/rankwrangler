import { failureFigures, ProviderVerdictChip } from './provider-verdict';
import { RefreshTierTable } from './refresh-tier-table';
import {
    formatCount,
    formatPercent,
    fraction,
    keepaWorkUsage,
    type RefreshTiers,
    type SystemStatus,
    spApiOperationUsage,
} from './status-model';
import { Headline, SegmentedBar, StatusBlock, StatusCard, StatusSection } from './status-panel';

/**
 * One column per provider: the last hour's usage against its allowance, the last day's throttles
 * and errors, and beneath them the refresh tiers that decide when it is called. Both cards read
 * the same way (headline, one bar per row, tier table) and share their row lines.
 */
export const StatusProviders = ({
    status,
    tiers,
}: {
    status: SystemStatus;
    tiers: RefreshTiers | undefined;
}) => (
    <div className="status-pair status-pair--aligned">
        <KeepaSection status={status} tiers={tiers?.keepa} />
        <SpApiSection status={status} tiers={tiers?.spApi} />
    </div>
);

/** Keepa: tokens spent in the last hour by work class, each against the hour's shared refill. */
const KeepaSection = ({
    status,
    tiers,
}: {
    status: SystemStatus;
    tiers: RefreshTiers['keepa'] | undefined;
}) => {
    const { keepa } = status;
    const work = keepaWorkUsage(keepa);
    const used = work.reduce((sum, row) => sum + row.tokens, 0);
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
                    <UsageRows
                        rows={work.map(row => ({
                            key: row.workClass,
                            label: row.label,
                            limit: keepa.capacity,
                            value: row.tokens,
                        }))}
                        unit="tokens"
                    />
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
                    <UsageRows
                        rows={operations.map(row => ({
                            key: row.operation,
                            label: row.label,
                            limit: row.hourlyLimit,
                            value: row.calls1h,
                        }))}
                        showLimit
                        unit="calls"
                    />
                </StatusBlock>
                <RefreshTierTable label="SP-API refresh tiers" tiers={tiers} />
            </StatusCard>
        </StatusSection>
    );
};

/**
 * One line per row: name, a bar of the last hour against its limit, and the count. `showLimit`
 * trails each count with its own limit; rows drawing on one shared allowance leave it to the aside.
 */
const UsageRows = ({
    rows,
    showLimit = false,
    unit,
}: {
    rows: ReadonlyArray<{
        readonly key: string;
        readonly label: string;
        readonly limit: number | null;
        readonly value: number;
    }>;
    showLimit?: boolean;
    unit: string;
}) => (
    <dl className="status-rows">
        {rows.map(row => (
            <div className="status-row" key={row.key}>
                <dt className="truncate">{row.label}</dt>
                <dd className="status-row__bar">
                    <SegmentedBar
                        label={`${row.label} ${unit} in the last hour`}
                        segments={[
                            { key: row.key, label: row.label, tone: 'current', value: row.value },
                        ]}
                        size="sm"
                        total={row.limit}
                    />
                </dd>
                <dd className="status-row__value">
                    {formatCount(row.value)}
                    {showLimit && row.limit !== null ? (
                        <span className="text-muted"> / {formatCount(row.limit)}</span>
                    ) : null}
                </dd>
            </div>
        ))}
    </dl>
);

const keepaAside = (keepa: SystemStatus['keepa']) => {
    if (keepa.refillRate === null) {
        return 'Awaiting first observation';
    }
    const left = keepa.tokensLeft === null ? '—' : formatCount(Math.round(keepa.tokensLeft));
    return `${left} left · ${formatCount(keepa.refillRate)}/min`;
};
