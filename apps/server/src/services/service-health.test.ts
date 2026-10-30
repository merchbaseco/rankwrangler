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
        expect(serviceHealthFromFailures(['spapi', 'keepa'])).toEqual({
            status: 'degraded',
            failing: ['keepa', 'spapi'],
        });
    });

    it('returns only postgres and skips providers when the postgres probe throws', async () => {
        let providerCalls = 0;
        const result = await readServiceHealth(
            probes({
                postgres: () => Promise.reject(new Error('database unavailable')),
                onProvider: () => {
                    providerCalls += 1;
                },
            })
        );

        expect(result).toEqual({ status: 'degraded', failing: ['postgres'] });
        expect(providerCalls).toBe(0);
    });

    it('reports a provider check when its probe throws and SELECT 1 still works', async () => {
        let postgresCalls = 0;
        const result = await readServiceHealth(
            probes({
                postgres: () => {
                    postgresCalls += 1;
                    return Promise.resolve();
                },
                throwing: 'keepa',
            })
        );

        expect(result).toEqual({ status: 'degraded', failing: ['keepa'] });
        expect(postgresCalls).toBe(2);
    });

    it('returns only postgres when a provider probe throws and SELECT 1 fails again', async () => {
        let postgresCalls = 0;
        let laterProviderCalls = 0;
        const result = await readServiceHealth(
            probes({
                postgres: () => {
                    postgresCalls += 1;
                    if (postgresCalls > 1) {
                        return Promise.reject(new Error('database unavailable'));
                    }
                    return Promise.resolve();
                },
                throwing: 'keepa',
                onProvider: name => {
                    if (name !== 'keepa') {
                        laterProviderCalls += 1;
                    }
                },
            })
        );

        expect(result).toEqual({ status: 'degraded', failing: ['postgres'] });
        expect(laterProviderCalls).toBe(0);
    });

    it('does not probe providers for liveness', async () => {
        let providerCalls = 0;
        const healthProbes = probes({
            onProvider: () => {
                providerCalls += 1;
            },
        });

        expect(await readLiveness(healthProbes)).toEqual({ status: 'ok' });
        expect(providerCalls).toBe(0);
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
    onProvider,
}: {
    failing?: readonly string[];
    throwing?: string;
    postgres?: () => Promise<void>;
    onProvider?: (name: string) => void;
} = {}): ServiceHealthProbes => {
    const providerProbe =
        (name: string): HealthFailingProbe =>
        () => {
            onProvider?.(name);
            if (throwing === name) {
                return Promise.reject(new Error(`${name} probe failed`));
            }
            return Promise.resolve(failing.includes(name));
        };

    return {
        postgres: postgres ?? (() => Promise.resolve()),
        providers: {
            keepa: providerProbe('keepa'),
            spapi: providerProbe('spapi'),
        },
    };
};
