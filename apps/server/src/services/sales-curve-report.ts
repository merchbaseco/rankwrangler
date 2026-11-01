import {
    curveBadgeShare,
    nextBadge,
    type SalesCurve,
    type SalesObservation,
} from './sales-curve-fit';

/** The rank ranges the accuracy check groups Products into, best rank first. */
export const ACCURACY_RANGE_EDGES = [
    40_000, 60_000, 100_000, 150_000, 200_000, 300_000, 400_000, 500_000, 700_000, 1_000_000,
    3_000_000,
] as const;
/** Fewest Products a rank bin needs before its badges are drawn as evidence. */
const MIN_BIN_PRODUCTS = 8;

/**
 * What the Status page draws from one fit, built with the fit so a page view never analyses
 * Products. `evidence` is the typical badged shirt per log-rank bin, kept only where most of the
 * bin shows a badge (elsewhere the badged few are not typical); its sales are the midpoint of the
 * typical badge's step. `ranges` set how many Products show a badge in each rank range against
 * how many the curve expects: the two agree while the curve is current.
 */
export const buildSalesCurveReport = (
    observations: readonly SalesObservation[],
    curve: SalesCurve
) => {
    const bins = new Map<number, SalesObservation[]>();
    for (const row of observations) {
        bins.set(row.bsr, [...(bins.get(row.bsr) ?? []), row]);
    }
    const evidence = [...bins]
        .sort(([a], [b]) => a - b)
        .flatMap(([bsr, rows]) => {
            const products = sum(rows);
            const badged = rows.filter(row => row.sold !== null);
            const badge = medianBadge(badged);
            return products >= MIN_BIN_PRODUCTS && sum(badged) * 2 >= products && badge !== null
                ? [
                      {
                          bsr: Math.round(bsr),
                          products,
                          typicalSales: Math.sqrt(badge * nextBadge(badge)),
                      },
                  ]
                : [];
        });
    const ranges = ACCURACY_RANGE_EDGES.slice(0, -1).flatMap((min, index) => {
        const max = ACCURACY_RANGE_EDGES[index + 1] ?? min;
        const rows = observations.filter(row => row.bsr >= min && row.bsr < max);
        const products = sum(rows);
        if (products === 0) {
            return [];
        }
        const expected = rows.reduce(
            (total, row) => total + row.count * curveBadgeShare(curve, row.bsr),
            0
        );
        return [
            {
                min,
                max,
                products,
                badged: sum(rows.filter(row => row.sold !== null)),
                expectedShare: expected / products,
            },
        ];
    });
    return { evidence, ranges };
};

const sum = (rows: readonly SalesObservation[]) =>
    rows.reduce((total, row) => total + row.count, 0);

/** The badge reading half the badged Products are at or above. */
const medianBadge = (rows: readonly SalesObservation[]) => {
    const sorted = [...rows].sort((a, b) => (a.sold ?? 0) - (b.sold ?? 0));
    let seen = 0;
    for (const row of sorted) {
        seen += row.count;
        if (seen * 2 >= sum(rows)) {
            return row.sold;
        }
    }
    return null;
};
