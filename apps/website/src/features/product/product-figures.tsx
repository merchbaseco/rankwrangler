import { KPIGroup } from '@heroui-pro/react';
import { KPI } from '@heroui-pro/react/kpi';
import { formatCount, formatShortDate } from '@/features/bsr/bsr-format';
import {
    bsrTierDefinitions,
    classifyBsr,
    estimateMonthlySales,
    tierClassName,
} from '@/features/bsr/bsr-tier';
import { trendOf } from '@/features/bsr/trend';
import { GridKpi, KpiFigure } from '@/features/grid/grid-kpi';
import { rankChangeVsAverage } from './product-format';
import type { ProductPageDetail } from './use-product-detail';

/**
 * The Product page's figures as a KPI header over its history (the Grid
 * direction's KPI cells, figure lines only): rank now in its tier, the 30-day
 * average with the move against it, the 90-day average, best ever, units
 * sold, rank drops and keyword reach. Missing figures read as an em dash.
 */
export const ProductFigures = ({
    keywordTotals,
    product,
}: {
    keywordTotals: { keywords: number; pageOne: number } | null;
    product: ProductPageDetail;
}) => {
    const keepa = product.keepa;
    const bsr = product.rootCategoryBsr ?? keepa?.currentRootCategoryBsr ?? null;
    const tier = classifyBsr(bsr);
    const change = rankChangeVsAverage(bsr, keepa?.averageRootCategoryBsr30);
    const reportedSold = keepa?.monthlySold ?? null;
    const best = product.bestEverBsr;
    return (
        <KPIGroup className="grid-kpis grid-kpis--product">
            <GridKpi
                band={false}
                dot={tierClassName(tier)}
                figure={<KpiFigure format="rankExact" value={bsr} />}
                span="even"
                suffix={bsrTierDefinitions[tier].label}
                title="BSR"
            />
            <GridKpi
                band={false}
                figure={
                    <KpiFigure format="rankExact" value={keepa?.averageRootCategoryBsr30 ?? null} />
                }
                span="even"
                suffix={
                    change === null ? undefined : (
                        <KPI.Trend trend={trendOf(change)} variant="tertiary">
                            {Math.abs(change)}%
                        </KPI.Trend>
                    )
                }
                title="30d average"
            />
            <GridKpi
                band={false}
                figure={
                    <KpiFigure format="rankExact" value={keepa?.averageRootCategoryBsr90 ?? null} />
                }
                span="even"
                title="90d average"
            />
            <GridKpi
                band={false}
                figure={<KpiFigure format="rankExact" value={best?.value ?? null} />}
                span="even"
                suffix={best ? formatShortDate(best.at) : undefined}
                title="Best ever"
            />
            <GridKpi
                band={false}
                figure={<KpiFigure value={reportedSold ?? estimateMonthlySales(bsr)} />}
                span="even"
                suffix={reportedSold === null ? 'estimate' : 'Amazon'}
                title="Sold/mo"
            />
            <GridKpi
                band={false}
                figure={<KpiFigure value={keepa?.salesRankDrops?.days30 ?? null} />}
                span="even"
                suffix={`${formatCount(keepa?.salesRankDrops?.days365)} in 1y`}
                title="Drops 30d"
            />
            <GridKpi
                band={false}
                figure={<KpiFigure value={keywordTotals?.keywords ?? null} />}
                span="even"
                suffix={
                    keywordTotals ? `${formatCount(keywordTotals.pageOne)} on page one` : undefined
                }
                title="Keywords"
            />
        </KPIGroup>
    );
};
