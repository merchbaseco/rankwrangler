import { describe, expect, it } from 'bun:test';
import {
    extractRateLimitFromError,
    extractRateLimitFromResponse,
    getLimiterSettingsFromRps,
    getRateLimitTunedRps,
    getThrottlePenalizedRps,
    isThrottleError,
    shouldApplyThrottlePenalty,
} from '@/services/spapi/spapi-rate-limiter.js';

describe('extractRateLimitFromResponse', () => {
    it('reads x-amzn-ratelimit-limit from root headers', () => {
        const value = extractRateLimitFromResponse({
            headers: {
                'x-amzn-RateLimit-Limit': '2',
            },
        });

        expect(value).toBe(2);
    });

    it('reads x-amzn-ratelimit-limit from nested response headers', () => {
        const value = extractRateLimitFromResponse({
            response: {
                headers: {
                    'x-amzn-ratelimit-limit': '0.0167',
                },
            },
        });

        expect(value).toBe(0.0167);
    });
});

describe('extractRateLimitFromError', () => {
    it('extracts header from retryable error response', () => {
        const value = extractRateLimitFromError({
            response: {
                headers: {
                    'x-amzn-ratelimit-limit': '1.5',
                },
                status: 429,
            },
        });

        expect(value).toBe(1.5);
    });
});

describe('getLimiterSettingsFromRps', () => {
    it('builds second-based refill settings for >=1 rps', () => {
        const settings = getLimiterSettingsFromRps({
            burstCapacity: 15,
            maxConcurrent: 2,
            rps: 2,
        });

        expect(settings.reservoirIncreaseAmount).toBe(2);
        expect(settings.reservoirIncreaseInterval).toBe(1000);
    });

    it('builds interval-based refill settings for <1 rps', () => {
        const settings = getLimiterSettingsFromRps({
            burstCapacity: 15,
            maxConcurrent: 1,
            rps: 0.0167,
        });

        expect(settings.reservoirIncreaseAmount).toBe(1);
        expect(settings.reservoirIncreaseInterval).toBeGreaterThanOrEqual(59000);
    });
});

describe('adaptive helpers', () => {
    it('applies smoothing and safety margin to observed limit', () => {
        const tuned = getRateLimitTunedRps({
            currentRps: 2,
            observedRateLimitRps: 1,
        });

        expect(tuned).toBeGreaterThan(1.3);
        expect(tuned).toBeLessThan(1.5);
    });

    it('penalizes rps after throttles', () => {
        expect(getThrottlePenalizedRps(2)).toBe(1.5);
    });

    it('detects 429 throttle errors', () => {
        expect(isThrottleError({ status: 429 })).toBeTrue();
        expect(isThrottleError({ status: 500 })).toBeFalse();
    });

    it('applies throttle penalty cooldown', () => {
        expect(shouldApplyThrottlePenalty(null)).toBeTrue();
        expect(shouldApplyThrottlePenalty(new Date().toISOString())).toBeFalse();
    });
});
