import { runBackground } from '@/db/index';
import { readSalesCurveObservations } from '@/db/sales-curve-observations';
import { createSwrCache } from '@/utils/swr-cache';
import { fitSalesCurve, REFERENCE_BSR } from './sales-curve-fit';
import { buildSalesCurveReport } from './sales-curve-report';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

/**
 * The rank-to-sales curve refits from the catalog's current badges, so it follows the season:
 * fresh for six hours, then served for a day more while a background fit replaces it. A fit
 * builds its Status report in the same pass, so every read is a stored value.
 */
const cachedFit = createSwrCache<Awaited<ReturnType<typeof fitCurrentSalesCurve>>>({
    freshMs: 6 * 3_600_000,
    staleMs: 24 * 3_600_000,
    maxEntries: 4,
    runRefresh: runBackground,
});

/**
 * The current fit and its Status report. The curve's median monthly sales at a rank are
 * `exp(intercept + slope · ln(bsr / referenceBsr))`, with `headSlope` above the reference rank
 * and `tailSlope` below it, fitted from Amazon's sold badges on the marketplace's Merch shirts;
 * `curve` and `report` are null while too few badges exist to fit. `products` and `badged` say
 * how much evidence it rests on.
 */
export const readSalesCurveFit = (marketplaceId = US_MARKETPLACE_ID) =>
    cachedFit(marketplaceId, () => fitCurrentSalesCurve(marketplaceId));

/** The curve alone, for the dashboard's sales estimates. */
export const readSalesCurve = async (marketplaceId = US_MARKETPLACE_ID) => {
    const { report: _report, ...curve } = await readSalesCurveFit(marketplaceId);
    return curve;
};

const fitCurrentSalesCurve = async (marketplaceId: string) => {
    const observations = await readSalesCurveObservations(marketplaceId);
    const curve = fitSalesCurve(observations);
    const count = (badged: boolean) =>
        observations.reduce(
            (sum, row) => sum + ((row.sold !== null) === badged ? row.count : 0),
            0
        );
    return {
        curve: curve && {
            referenceBsr: REFERENCE_BSR,
            intercept: curve.intercept,
            headSlope: curve.headSlope,
            tailSlope: curve.tailSlope,
            sigma: curve.sigma,
        },
        report: curve && buildSalesCurveReport(observations, curve),
        fittedAt: new Date().toISOString(),
        products: count(true) + count(false),
        badged: count(true),
    };
};
