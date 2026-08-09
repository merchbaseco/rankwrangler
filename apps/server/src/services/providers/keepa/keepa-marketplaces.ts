import type { KeepaProviderPriority } from './keepa-provider-types';

const keepaDomainIds: Record<string, number> = {
    ATVPDKIKX0DER: 1,
    A1F83G8C2ARO7P: 2,
    A1PA6795UKMFR9: 3,
    A13V1IB3VIYZZH: 4,
    A1VC38T7YXB528: 5,
    A2EUQ1WTGCTBG2: 8,
    A1RKKUPIHCS9HS: 9,
    A21TJRUUN4KGV: 10,
    A1AM78C64UM0Y8: 11,
    A2Q3Y263D00KWC: 12,
};

export const requireKeepaDomainId = (marketplaceId: string) => {
    const domainId = keepaDomainIds[marketplaceId];
    if (!domainId) {
        throw new Error(`Marketplace ${marketplaceId} is not supported by Keepa integration`);
    }
    return domainId;
};

export const getKeepaProviderPriority = (priority: KeepaProviderPriority) => {
    return { interactiveCatalog: 0, scheduledCatalog: 1, manualProduct: 2, scheduledProduct: 5 }[
        priority
    ];
};
