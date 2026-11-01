import { formatCount } from '@/features/bsr/bsr-format';
import { curveMonthlySales, formatSalesPace } from '@/features/bsr/sales-estimate';
import { useLiveRelativeTime } from '@/hooks/use-live-relative-time';
import { SalesCurveAccuracy } from './sales-curve-accuracy';
import { SalesCurveChart } from './sales-curve-chart';
import { accuracyRows, accuracySummary } from './sales-curve-model';
import { Headline, StatusBlock, StatusCard, StatusSection } from './status-panel';
import { type SalesCurveFit, useSalesCurveFit } from './use-sales-curve-fit';

const CHART_HEIGHT = 320;
const HEADLINE_RANKS = [
    [100_000, '#100K'],
    [300_000, '#300K'],
    [1_000_000, '#1M'],
] as const;

/**
 * Sales curve: what a Best Sellers Rank means in sales right now, refitted
 * every six hours from Amazon's "bought in past month" badges. The pace at
 * three ranks heads it, then the curve over its badge evidence, then the
 * check that the curve still matches Amazon. Everything comes from the stored
 * fit; nothing is analysed while the page loads.
 */
export const StatusSalesCurve = () => {
    const fit = useSalesCurveFit();
    const rebuilt = useLiveRelativeTime(fit.data?.fittedAt);
    return (
        <StatusSection
            caption={
                fit.data
                    ? `Rebuilt ${rebuilt} from ${formatCount(fit.data.products)} shirts, ${formatCount(fit.data.badged)} with a badge`
                    : undefined
            }
            title="Sales curve"
        >
            {fit.data ? (
                <SalesCurveBody fit={fit.data} />
            ) : (
                <p className="text-muted">{fit.error ? fit.error.message : 'Loading…'}</p>
            )}
        </StatusSection>
    );
};

const SalesCurveBody = ({ fit }: { fit: SalesCurveFit }) => {
    const { curve, report } = fit;
    if (!(curve && report)) {
        return <p className="text-muted">Too few shirts carry a badge to fit a curve yet.</p>;
    }
    return (
        <>
            <StatusCard>
                <Headline
                    figures={HEADLINE_RANKS.map(([rank, label]) => {
                        const monthly = curveMonthlySales(curve, rank);
                        return {
                            display: formatSalesPace(monthly),
                            label: `A ${label} shirt sells`,
                            note: `≈${formatCount(Math.round(monthly))} a month`,
                            value: null,
                        };
                    })}
                />
                <SalesCurveChart curve={curve} evidence={report.evidence} height={CHART_HEIGHT} />
                <ul className="status-legend">
                    <li className="status-legend__item">
                        <span aria-hidden className="sales-curve-key sales-curve-key--line" />
                        The curve: a typical shirt
                    </li>
                    <li className="status-legend__item">
                        <span aria-hidden className="sales-curve-key sales-curve-key--range" />
                        Where most shirts land
                    </li>
                    <li className="status-legend__item">
                        <span aria-hidden className="sales-curve-key sales-curve-key--evidence" />
                        Amazon&apos;s badge, typical shirt
                    </li>
                </ul>
                <p className="sales-curve__note">
                    Badge dots stop past about #500K: most shirts there sell under 50 a month, so
                    Amazon shows no badge and the curve carries the trend on.
                </p>
            </StatusCard>
            <StatusCard>
                <StatusBlock
                    aside={accuracySummary(accuracyRows(report.ranges))}
                    title="Is the curve still accurate?"
                >
                    <SalesCurveAccuracy ranges={report.ranges} />
                </StatusBlock>
            </StatusCard>
        </>
    );
};
