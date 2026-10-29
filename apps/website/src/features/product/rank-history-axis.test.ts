import { describe, expect, test } from 'bun:test';
import { bandPixelHeight, MIN_BAND_LABEL_PX, tierBands } from './rank-history-axis';

describe('rank history tier bands', () => {
    test('each band is clipped to its own rank range inside the domain', () => {
        const bands = tierBands([300, 3000]);
        expect(bands.map(band => [band.tier, band.y1, band.y2])).toEqual([
            ['elite', 300, 2500],
            ['hot', 2501, 3000],
        ]);
    });

    test('a sliver of a band is too short to label', () => {
        const domain = [300, 3000] as const;
        const [elite, hot] = tierBands(domain);
        expect(elite && bandPixelHeight(elite, domain, 200)).toBeGreaterThan(MIN_BAND_LABEL_PX);
        expect(hot && bandPixelHeight(hot, domain, 120)).toBeLessThan(MIN_BAND_LABEL_PX);
    });
});
