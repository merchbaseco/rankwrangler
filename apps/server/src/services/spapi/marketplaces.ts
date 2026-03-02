export const SPAPI_US_MARKETPLACE_ID = 'ATVPDKIKX0DER' as const;

export const isSupportedSpApiMarketplaceId = (
    value: string
): value is typeof SPAPI_US_MARKETPLACE_ID => value === SPAPI_US_MARKETPLACE_ID;
