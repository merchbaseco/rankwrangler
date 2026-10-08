import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
    type HealthFailingProbe,
    readLiveness,
    readServiceHealth,
    type ServiceHealthProbes,
    serviceHealthFromFailures,
} from './service-health';

const originalConsoleError = console.error;

describe('service health', () => {
    beforeEach(() => {
        console.error = () => undefined;
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    it('returns ok when nothing is failing', async () => {
        expect(serviceHealthFromFailures([])).toEqual({ status: 'ok' });
        expect(await readServiceHealth(probes())).toEqual({ status: 'ok' });
    });

    it('reports failing checks in check-list order', () => {
        expect(serviceHealthFromFailures(['catalog-queries', 'spapi-catalog'])).toEqual({
            status: 'degraded',
            failing: ['spapi-catalog', 'catalog-queries'],
        });
    });

    it('returns only postgres and skips freshness when the postgres probe throws', async () => {
        let freshnessCalls = 0;
        const result = await readServiceHealth(
            probes({
                postgres: () => Promise.reject(new Error('database unavailable')),
                onFreshness: () => {
                    freshnessCalls += 1;
                },
            })
        );

        expect(result).toEqual({ status: 'degraded', failing: ['postgres'] });
        expect(freshnessCalls).toBe(0);
    });

    it('reports a freshness check when its probe throws and SELECT 1 still works', async () => {
        let postgresCalls = 0;
        const result = await readServiceHealth(
            probes({
                postgres: () => {
                    postgresCalls += 1;
                    return Promise.resolve();
                },
                throwing: 'keepa-history',
            })
        );

        expect(result).toEqual({ status: 'degraded', failing: ['keepa-history'] });
        expect(postgresCalls).toBe(2);
    });

    it('returns only postgres when a freshness probe throws and SELECT 1 fails again', async () => {
        let postgresCalls = 0;
        let laterFreshnessCalls = 0;
        const result = await readServiceHealth(
            probes({
                postgres: () => {
                    postgresCalls += 1;
                    if (postgresCalls > 1) {
                        return Promise.reject(new Error('database unavailable'));
                    }
                    return Promise.resolve();
                },
                throwing: 'spapi-catalog',
                onFreshness: name => {
                    if (name !== 'spapi-catalog') {
                        laterFreshnessCalls += 1;
                    }
                },
            })
        );

        expect(result).toEqual({ status: 'degraded', failing: ['postgres'] });
        expect(laterFreshnessCalls).toBe(0);
    });

    it('does not run freshness for liveness', async () => {
        let freshnessCalls = 0;
        const healthProbes = probes({
            onFreshness: () => {
                freshnessCalls += 1;
            },
        });

        expect(await readLiveness(healthProbes)).toEqual({ status: 'ok' });
        expect(freshnessCalls).toBe(0);
    });

    it('reports only postgres when liveness cannot run SELECT 1', async () => {
        const result = await readLiveness({
            postgres: () => Promise.reject(new Error('database unavailable')),
        });

        expect(result).toEqual({ status: 'degraded', failing: ['postgres'] });
    });
});

const probes = ({
    failing = [],
    throwing,
    postgres,
    onFreshness,
}: {
    failing?: readonly string[];
    throwing?: string;
    postgres?: () => Promise<void>;
    onFreshness?: (name: string) => void;
} = {}): ServiceHealthProbes => {
    const freshnessProbe =
        (name: string): HealthFailingProbe =>
        () => {
            onFreshness?.(name);
            if (throwing === name) {
                return Promise.reject(new Error(`${name} probe failed`));
            }
            return Promise.resolve(failing.includes(name));
        };

    return {
        postgres: postgres ?? (() => Promise.resolve()),
        freshness: {
            'catalog-queries': freshnessProbe('catalog-queries'),
            'keepa-history': freshnessProbe('keepa-history'),
            'spapi-catalog': freshnessProbe('spapi-catalog'),
            'top-search-terms': freshnessProbe('top-search-terms'),
        },
    };
};
