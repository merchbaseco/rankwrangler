import { describe, expect, it } from 'bun:test';
import type { captureProviderAttempt } from '../provider-telemetry';
import type { KeepaCapacity } from './keepa-capacity-types';
import { KeepaProvider } from './keepa-provider';

const capacity: KeepaCapacity = {
    enqueue: async () => 'test',
    cancel: () => Promise.resolve(),
    reserve: () => Promise.resolve(),
    settle: () => Promise.resolve(),
};

describe('Keepa provider lanes', () => {
    it('runs any number of live searches together', async () => {
        const searches = await peakSearchesInFlight('interactiveCatalog', 12);

        expect(searches).toBe(12);
    });

    it('keeps background searches two at a time', async () => {
        const searches = await peakSearchesInFlight('scheduledCatalog', 4);

        expect(searches).toBe(2);
    });
});

const peakSearchesInFlight = async (
    priority: 'interactiveCatalog' | 'scheduledCatalog',
    count: number
) => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = (async (input: string | URL) => {
        if (!String(input).includes('/search')) {
            return Response.json({ tokensLeft: 1000, refillIn: 1000, refillRate: 20 });
        }
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setTimeout(resolve, 1500));
        inFlight -= 1;
        return Response.json({ products: [] });
    }) as typeof fetch;
    const provider = new KeepaProvider({
        capacity,
        apiKey: 'keepa-test-key',
        capture: (async (_descriptor, run) => await run()) as typeof captureProviderAttempt,
        fetchImpl,
    });

    await Promise.all(
        Array.from({ length: count }, (_, index) =>
            provider.searchCatalog({
                marketplaceId: 'ATVPDKIKX0DER',
                term: `burst ${index}`,
                priority,
                workClass: priority === 'interactiveCatalog' ? 'interactive' : 'head',
            })
        )
    );
    return peak;
};
