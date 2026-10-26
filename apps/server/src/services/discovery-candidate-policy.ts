import type { DiscoveryScope } from './discovery-types';

export const normalizeDiscoveryText = (value: string) => value.trim().replace(/\s+/gu, ' ');
export const normalizeDiscoveryBrand = (value: string) =>
    normalizeDiscoveryText(value).toLowerCase();

export const researchDiscoveryScopes = (term: string): DiscoveryScope[] => {
    const text = normalizeDiscoveryText(term);
    if (!text || /^B0[A-Z0-9]{8}$/iu.test(text)) return [];
    const result: DiscoveryScope[] = [{ kind: 'keyword', term: text }];
    return result;
};
