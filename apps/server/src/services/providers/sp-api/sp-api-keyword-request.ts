export interface SpApiKeywordSearchRequest {
    keyword: string;
    marketplaceId: string;
    pageSize: number;
    pageToken?: string;
    maxAttempts?: number;
    brandNames?: string[];
    priority?: 'foreground' | 'background';
}
