import { KPIGroup } from '@heroui-pro/react';
import { formatCount } from '@/features/bsr/bsr-format';
import { curveMonthlySales } from '@/features/bsr/sales-estimate';
import { GridKpi, KpiFigure } from '@/features/grid/grid-kpi';
import { ProductSection } from '@/features/product/product-section';
import { useLiveRelativeTime } from '@/hooks/use-live-relative-time';
import { SalesCurveAccuracy } from './sales-curve-accuracy';
import { SalesCurveChart } from './sales-curve-chart';
import { accuracyRows, accuracySummary } from './sales-curve-model';
import { StatusSection } from './status-panel';
import { type SalesCurveFit, useSalesCurveFit } from './use-sales-curve-fit';

const CHART_HEIGHT = 320;
const KEY_RANKS = [
    { dot: 'tier-hot', label: '#100K', rank: 100_000 },
    { dot: 'tier-strong', label: '#300K', rank: 300_000 },
    { dot: 'tier-steady', label: '#1M', rank: 1_000_000 },
] as const;

/**
 * Sales curve: what a Best Sellers Rank means in sales right now, refitted
 * every six hours from Amazon's "bought in past month" badges. One panel in
 * the Product page's grid: KPI cells for sales a day at three ranks and the
 * badged shirts behind the fit, the curve drawn like the rank chart, then the
 * check that it still matches Amazon range by range. Everything comes from
 * the stored fit; nothing is analysed while the page loads.
 */
export const StatusSalesCurve = () => {
    const fit = useSalesCurveFit();
    const refit = useLiveRelativeTime(fit.data?.fittedAt);
    return (
        <StatusSection
            caption={fit.data ? `Refit ${refit} · every 6 hours` : undefined}
            title="Sales curve"
        >
            {fit.data ? (
                <SalesCurvePanel fit={fit.data} />
            ) : (
                <p className="text-muted">{fit.error ? fit.error.message : 'Loading…'}</p>
            )}
        </StatusSection>
    );
};

const SalesCurvePanel = ({ fit }: { fit: SalesCurveFit }) => {
    const { curve, report } = fit;
    if (!(curve && report)) {
        return <p className="text-muted">Too few shirts carry a badge to fit a curve yet.</p>;
    }
    return (
        <div className="sales-curve-panel">
            <KPIGroup className="grid-kpis grid-kpis--curve grid-kpis--wraps">
                {KEY_RANKS.map(({ dot, label, rank }) => (
                    <GridKpi
                        band={false}
                        dot={dot}
                        figure={
                            <KpiFigure
                                format="average"
                                value={curveMonthlySales(curve, rank) / 30}
                            />
                        }
                        key={label}
                        span="even"
                        suffix="a day"
                        title={`Sales at ${label}`}
                    />
                ))}
                <GridKpi
                    band={false}
                    dot="band-ink-accent"
                    figure={<KpiFigure value={fit.badged} />}
                    span="even"
                    suffix={`of ${formatCount(fit.products)}`}
                    title="Badged shirts"
                />
            </KPIGroup>
            <ProductSection context="Median sold a month by 30-day BSR" title="Curve">
                <div className="sales-curve-frame">
                    <SalesCurveChart
                        curve={curve}
                        evidence={report.evidence}
                        height={CHART_HEIGHT}
                    />
                </div>
                <p className="sales-curve__note">
                    Dots are Amazon&apos;s badge for a typical shirt; past #500K most sell under 50
                    a month, so there is no badge.
                </p>
            </ProductSection>
            <ProductSection context={accuracySummary(accuracyRows(report.ranges))} title="Accuracy">
                <ul className="status-legend sales-curve__legend">
                    <li className="status-legend__item">
                        <span aria-hidden className="status-swatch status-tone--idle" />
                        Shirts showing a badge
                    </li>
                    <li className="status-legend__item">
                        <span aria-hidden className="sales-curve-key sales-curve-key--tick" />
                        What the curve expects
                    </li>
                </ul>
                <SalesCurveAccuracy ranges={report.ranges} />
            </ProductSection>
        </div>
    );
};
