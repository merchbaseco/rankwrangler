import type { FastifyInstance } from 'fastify';
import { type HealthProbe, type JobRunnerState, readHealthProbe } from '@/health/health-probe';
import { evaluateHealth, type HealthVerdict } from '@/health/health-verdict';

export const HEALTH_PATH = '/api/health';
export const HEALTH_LIVE_PATH = '/api/health/live';

interface HealthRouteDeps {
    readonly readProbe: (input: { now: Date; jobRunner: JobRunnerState }) => Promise<HealthProbe>;
    readonly now: () => Date;
}

/** Fastify derives HEAD from each GET with the same handler, so HEAD mirrors the GET status. */
export const registerHealthRoutes = (
    fastify: FastifyInstance,
    { jobRunner }: { readonly jobRunner: JobRunnerState },
    deps: HealthRouteDeps = defaultHealthRouteDeps
) => {
    fastify.get(HEALTH_LIVE_PATH, async () => LIVE_BODY);

    const check = createReusedCheck(jobRunner, deps);
    fastify.get(HEALTH_PATH, async (_request, reply) => {
        const checked = await check().catch(() => ({
            verdict: DATABASE_FAILURE,
            checkedAt: deps.now(),
        }));
        const { statusCode, body } = toHealthReply(checked);
        return reply.code(statusCode).header('cache-control', 'no-store').send(body);
    });
};

interface CheckedVerdict {
    readonly verdict: HealthVerdict;
    readonly checkedAt: Date;
}

const createReusedCheck = (jobRunner: JobRunnerState, deps: HealthRouteDeps) => {
    let latest: { readonly startedAtMs: number; readonly result: Promise<CheckedVerdict> } | null =
        null;
    return (): Promise<CheckedVerdict> => {
        const now = deps.now();
        if (latest !== null && now.getTime() - latest.startedAtMs < PROBE_REUSE_MS) {
            return latest.result;
        }
        const entry = { startedAtMs: now.getTime(), result: checkHealth(jobRunner, deps, now) };
        latest = entry;
        entry.result.catch(() => {
            if (latest === entry) {
                latest = null;
            }
        });
        return entry.result;
    };
};

const checkHealth = async (
    jobRunner: JobRunnerState,
    deps: HealthRouteDeps,
    now: Date
): Promise<CheckedVerdict> => {
    const probe = await deps.readProbe({ now, jobRunner });
    return { verdict: evaluateHealth({ now, jobRunner, probe }), checkedAt: now };
};

const toHealthReply = ({ verdict, checkedAt }: CheckedVerdict) => {
    switch (verdict.status) {
        case 'ok':
            return {
                statusCode: 200,
                body: {
                    status: 'ok',
                    timestamp: checkedAt.toISOString(),
                    service: 'rankwrangler-server',
                },
            } as const;
        case 'degraded':
            return {
                statusCode: 503,
                body: { status: 'degraded', failing: verdict.failing },
            } as const;
        default:
            return assertNever(verdict);
    }
};

const assertNever = (value: never): never => {
    throw new Error(`Unhandled health verdict: ${JSON.stringify(value)}`);
};

const LIVE_BODY = { status: 'ok' } as const;
const DATABASE_FAILURE = {
    status: 'degraded',
    failing: ['database'],
} as const satisfies HealthVerdict;
const PROBE_REUSE_MS = 15_000;
const defaultHealthRouteDeps: HealthRouteDeps = {
    readProbe: readHealthProbe,
    now: () => new Date(),
};
