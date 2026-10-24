export const getMarketplaceCurrencyCode = (marketplaceId: string) => {
    const currencies: Record<string, string> = {
        ATVPDKIKX0DER: 'USD',
        A1F83G8C2ARO7P: 'GBP',
        A1PA6795UKMFR9: 'EUR',
        A13V1IB3VIYZZH: 'EUR',
        A1VC38T7YXB528: 'JPY',
        APJ6JRA9NG5V4: 'EUR',
        A2EUQ1WTGCTBG2: 'CAD',
        A1RKKUPIHCS9HS: 'EUR',
        A21TJRUUN4KGV: 'INR',
        A1AM78C64UM0Y8: 'MXN',
        A2Q3Y263D00KWC: 'BRL',
    };

    return currencies[marketplaceId] ?? null;
};
