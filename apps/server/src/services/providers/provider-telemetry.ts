import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { providerAttempts } from '@/db/provider-telemetry-schema';

export const providerNames = ['keepa', 'spapi'] as const;
export type ProviderName = (typeof providerNames)[number];

export const keepaProviderOperations = [
    'keepa.product',
    'keepa.token',
    'keepa.category',
    'keepa.catalog.search',
] as const;
export type KeepaProviderOperation = (typeof keepaProviderOperations)[number];

export const spApiProviderOperations = [
    'spapi.lwa.token',
    'spapi.catalog.search',
    'spapi.reports.create',
    'spapi.reports.get',
    'spapi.reports.getDocument',
    'spapi.reports.download',
] as const;
export type SpApiProviderOperation = (typeof spApiProviderOperations)[number];

export const providerOperations = [...keepaProviderOperations, ...spApiProviderOperations] as const;
export type ProviderOperation = (typeof providerOperations)[number];

export type ProviderAttemptDescriptor =
    | { provider: 'keepa'; operation: KeepaProviderOperation }
    | { provider: 'spapi'; operation: SpApiProviderOperation };

export type ProviderAttemptRecord = ProviderAttemptDescriptor & {
    attemptedAt: Date;
    statusCode: number | null;
    isError: boolean;
    latencyMs: number;
};

interface CaptureProviderAttemptDeps {
    now: () => number;
    record: (attempt: ProviderAttemptRecord) => Promise<void>;
}

const defaultCaptureDeps: CaptureProviderAttemptDeps = {
    now: Date.now,
    record: async attempt => {
        const { db } = await import('@/db/index');
        await db.insert(providerAttempts).values(attempt);
    },
};

export const captureProviderAttempt = async <T>(
    descriptor: ProviderAttemptDescriptor,
    run: () => Promise<T>,
    overrides: Partial<CaptureProviderAttemptDeps> = {}
): Promise<T> => {
    const deps = { ...defaultCaptureDeps, ...overrides };
    const startedAtMs = deps.now();

    try {
        const result = await run();
        const statusCode = extractHttpStatus(result);
        await recordProviderAttemptFailOpen(deps.record, {
            ...descriptor,
            attemptedAt: new Date(startedAtMs),
            statusCode,
            isError: statusCode !== null && statusCode >= 400,
            latencyMs: Math.max(0, deps.now() - startedAtMs),
        });
        return result;
    } catch (error) {
        await recordProviderAttemptFailOpen(deps.record, {
            ...descriptor,
            attemptedAt: new Date(startedAtMs),
            statusCode: extractHttpStatus(error),
            isError: true,
            latencyMs: Math.max(0, deps.now() - startedAtMs),
        });
        throw error;
    }
};

export type ProviderTelemetryQuery = { hours: number } & (
    | { provider?: undefined; operation?: never }
    | { provider: 'keepa'; operation?: KeepaProviderOperation }
    | { provider: 'spapi'; operation?: SpApiProviderOperation }
);

export const getProviderTelemetry = async ({
    hours,
    provider,
    operation,
}: ProviderTelemetryQuery) => {
    const { db } = await import('@/db/index');
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const conditions = [gte(providerAttempts.attemptedAt, since)];
    if (provider) {
        conditions.push(eq(providerAttempts.provider, provider));
    }
    if (operation) {
        conditions.push(eq(providerAttempts.operation, operation));
    }
    const where = and(...conditions);

    const [totalsRows, breakdownRows, recentAttempts] = await Promise.all([
        db
            .select({
                total: count(),
                errors: sql<number>`count(*) filter (where ${providerAttempts.isError})::int`,
                maxLatencyMs: sql<number | null>`max(${providerAttempts.latencyMs})::int`,
            })
            .from(providerAttempts)
            .where(where),
        db
            .select({
                provider: providerAttempts.provider,
                operation: providerAttempts.operation,
                isError: providerAttempts.isError,
                count: count(),
            })
            .from(providerAttempts)
            .where(where)
            .groupBy(
                providerAttempts.provider,
                providerAttempts.operation,
                providerAttempts.isError
            )
            .orderBy(
                asc(providerAttempts.provider),
                asc(providerAttempts.operation),
                asc(providerAttempts.isError)
            ),
        db
            .select()
            .from(providerAttempts)
            .where(where)
            .orderBy(desc(providerAttempts.attemptedAt))
            .limit(100),
    ]);

    const totals = totalsRows[0] ?? { total: 0, errors: 0, maxLatencyMs: null };
    return {
        since,
        totals: {
            attempts: totals.total,
            errors: totals.errors,
            successes: totals.total - totals.errors,
            maxLatencyMs: totals.maxLatencyMs,
        },
        breakdown: breakdownRows,
        recentAttempts,
    };
};

const recordProviderAttemptFailOpen = async (
    record: CaptureProviderAttemptDeps['record'],
    attempt: ProviderAttemptRecord
) => {
    try {
        await record(attempt);
    } catch (error) {
        console.warn('[Provider Telemetry] Failed to record provider attempt:', error);
    }
};

const extractHttpStatus = (value: unknown): number | null => {
    if (value instanceof Response) {
        return normalizeHttpStatus(value.status);
    }
    if (!isRecord(value)) {
        return null;
    }

    const candidates = [
        value.status,
        value.statusCode,
        isRecord(value.response) ? value.response.status : null,
        isRecord(value._response) ? value._response.status : null,
        isRecord(value.$response) ? value.$response.status : null,
        isRecord(value.rawResponse) ? value.rawResponse.status : null,
        isRecord(value.httpResponse) ? value.httpResponse.status : null,
    ];
    for (const candidate of candidates) {
        const status = normalizeHttpStatus(candidate);
        if (status !== null) {
            return status;
        }
    }
    return null;
};

const normalizeHttpStatus = (value: unknown) => {
    return typeof value === 'number' && value >= 100 && value <= 599 ? value : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const deleteExpiredProviderAttempts = async ({
    before,
    batchSize,
}: {
    before: Date;
    batchSize: number;
}) => {
    const { db } = await import('@/db/index');
    const rows = await db
        .select({ id: providerAttempts.id })
        .from(providerAttempts)
        .where(lte(providerAttempts.attemptedAt, before))
        .orderBy(asc(providerAttempts.attemptedAt))
        .limit(batchSize);
    if (rows.length === 0) {
        return 0;
    }

    await db.delete(providerAttempts).where(
        inArray(
            providerAttempts.id,
            rows.map(row => row.id)
        )
    );
    return rows.length;
};
