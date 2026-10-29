import type { captureProviderAttempt } from '@/services/providers/provider-telemetry';
import type { KeepaCapacity, KeepaCapacityOperation } from './keepa-capacity-types';
import { KeepaApiError, type KeepaUsageSource } from './keepa-provider-types';

export const fetchKeepaJson = async <T>({
    operation,
    path,
    params,
    apiKey,
    fetchImpl,
    capture,
    capacity,
    attemptId,
    recordUsage,
}: {
    operation: 'keepa.product' | 'keepa.token' | 'keepa.category' | 'keepa.catalog.search';
    path: KeepaCapacityOperation;
    params: Record<string, string>;
    apiKey: string;
    fetchImpl: typeof fetch;
    capture: typeof captureProviderAttempt;
    capacity: KeepaCapacity;
    attemptId: string;
    recordUsage: (usage: KeepaUsageSource) => void;
}): Promise<T> => {
    let usage: KeepaUsageSource | null = null;
    try {
        const query = new URLSearchParams({ key: apiKey, ...params });
        const result = await capture({ provider: 'keepa', operation }, async () => {
            const response = await fetchImpl(`https://api.keepa.com/${path}?${query.toString()}`);
            const payload: unknown = await response.json();
            usage = readKeepaUsage(
                typeof payload === 'number' && path === 'token' ? { tokensLeft: payload } : payload
            );
            recordUsage(usage);
            const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
            if (!response.ok || error) {
                throw new KeepaApiError({
                    code: String(error?.code ?? error?.type ?? response.status),
                    message: String(error?.message ?? `HTTP ${response.status}`),
                    payload,
                    status: response.status,
                });
            }
            return { payload: payload as T, status: response.status };
        });
        return result.payload;
    } finally {
        // Settlement does not depend on valid products, HTTP success, or downstream ingestion.
        await capacity.settle(attemptId, usage);
    }
};

const readKeepaUsage = (payload: unknown): KeepaUsageSource => {
    const record = isRecord(payload) ? payload : {};
    const number = (key: string) =>
        typeof record[key] === 'number' && Number.isInteger(record[key]) && record[key] >= 0
            ? (record[key] as number)
            : undefined;
    return {
        tokensConsumed: number('tokensConsumed'),
        tokensLeft: number('tokensLeft'),
        refillIn: number('refillIn'),
        refillRate: number('refillRate'),
    };
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
