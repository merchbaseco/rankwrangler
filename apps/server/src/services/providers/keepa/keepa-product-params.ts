import { requireKeepaDomainId } from './keepa-marketplaces';

const KEEPA_UPDATE_HOURS = 1;

export const keepaProductParams = ({
    marketplaceId,
    asins,
    days,
}: {
    marketplaceId: string;
    asins: readonly string[];
    days: number;
}) => ({
    domain: String(requireKeepaDomainId(marketplaceId)),
    asin: asins.join(','),
    history: '1',
    update: String(KEEPA_UPDATE_HOURS),
    days: String(days),
    stats: '365',
});
