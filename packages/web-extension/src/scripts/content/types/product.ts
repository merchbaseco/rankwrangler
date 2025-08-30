export interface Product {
    asin: string;
    creationDate?: string;
    bsr?: number;
    metadata: {
        success: boolean;
        lastFetched?: string; // ISO timestamp
        cached?: boolean;
    };
}

export const getErrorProduct = (asin: string): Product => {
    return {
        asin: asin,
        metadata: {
            success: false,
        },
    };
};
