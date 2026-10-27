import type { spApiCatalogCapacity } from '@/db/spapi-capacity-schema';

// Background keyword scans may use most of the Catalog rate: interactive and listing reads go
// first through the shared bucket, and they used about 70 calls a day in October 2026. The
// absolute ceiling is the operator-set `background_max_rps` on the capacity row.
export const CATALOG_BACKGROUND_SHARE = 0.75;
type State = typeof spApiCatalogCapacity.$inferSelect;

export const catalogCapacityBalance = (state: State, now: Date) => {
    const fresh = state.observedAt && now.getTime() - state.observedAt.getTime() <= 3_600_000;
    const rps = Math.max(0.05, fresh ? state.effectiveRps : Math.min(state.effectiveRps, 1));
    const backgroundRps = Math.min(state.backgroundMaxRps, rps * CATALOG_BACKGROUND_SHARE);
    const seconds = Math.max(0, now.getTime() - state.updatedAt.getTime()) / 1000;
    return {
        rps,
        backgroundRps,
        tokens: Math.min(2, state.tokens + seconds * rps),
        backgroundTokens: Math.min(1, state.backgroundTokens + seconds * backgroundRps),
        updatedAt: now,
    };
};

export const catalogCapacityDecision = (
    state: State,
    input: { priority: 'foreground' | 'background'; protectedQueued: boolean; now: Date }
) => {
    const balance = catalogCapacityBalance(state, input.now);
    const background = input.priority === 'background';
    const rateWait =
        Math.max(
            0,
            (1 - balance.tokens) / balance.rps,
            background ? (1 - balance.backgroundTokens) / balance.backgroundRps : 0
        ) * 1000;
    const cooldown = state.cooldownUntil?.getTime() ?? 0;
    const protectedDeadline = background
        ? Math.max(
              state.backgroundPausedUntil?.getTime() ?? 0,
              input.protectedQueued ? input.now.getTime() + 1000 : 0
          )
        : 0;
    const retryAt = new Date(
        Math.max(cooldown, input.now.getTime() + Math.ceil(rateWait), protectedDeadline)
    );
    if (retryAt > input.now) {
        return {
            kind: 'deferred' as const,
            reason:
                cooldown > input.now.getTime()
                    ? ('cooldown' as const)
                    : protectedDeadline > input.now.getTime()
                      ? ('protectedWork' as const)
                      : ('rate' as const),
            retryAt,
            balance,
        };
    }
    return {
        kind: 'granted' as const,
        balance: {
            ...balance,
            tokens: balance.tokens - 1,
            backgroundTokens: balance.backgroundTokens - (background ? 1 : 0),
        },
    };
};

export const catalogCapacityObservation = (
    state: State,
    input: {
        now: Date;
        observedRate: number | null;
        throttled: boolean;
        retryAfterMs: number;
    }
) => {
    const balance = catalogCapacityBalance(state, input.now);
    const ceiling = input.observedRate === null ? state.effectiveRps : input.observedRate * 0.8;
    const recovering =
        state.lastThrottleAt && input.now.getTime() - state.lastThrottleAt.getTime() < 900_000;
    return {
        tokens: balance.tokens,
        backgroundTokens: balance.backgroundTokens,
        updatedAt: input.now,
        effectiveRps: Math.max(
            0.05,
            input.throttled
                ? state.effectiveRps / 2
                : recovering
                  ? Math.min(ceiling, state.effectiveRps * 1.1)
                  : ceiling
        ),
        observedRate: input.observedRate ?? state.observedRate,
        observedAt: input.observedRate === null ? state.observedAt : input.now,
        lastThrottleAt: input.throttled ? input.now : state.lastThrottleAt,
        cooldownUntil: input.throttled
            ? new Date(
                  Math.max(
                      state.cooldownUntil?.getTime() ?? 0,
                      input.now.getTime() + Math.max(60_000, input.retryAfterMs)
                  )
              )
            : state.cooldownUntil,
    };
};
