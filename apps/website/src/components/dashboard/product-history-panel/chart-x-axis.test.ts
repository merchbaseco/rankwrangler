import { describe, expect, it } from 'bun:test';
import { buildXAxisFormatter, buildXAxisTicks } from './chart-x-axis';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('buildXAxisFormatter', () => {
    it('formats short ranges with month and day', () => {
        const formatter = buildXAxisFormatter(0, 100 * DAY_MS);
        const label = formatter(new Date(2025, 0, 15).getTime());
        expect(label).toBe('Jan 15');
    });

    it('formats medium ranges with Jan including year and other months as month only', () => {
        const formatter = buildXAxisFormatter(0, 300 * DAY_MS);
        expect(formatter(new Date(2025, 0, 1).getTime())).toBe('Jan 25');
        expect(formatter(new Date(2025, 1, 1).getTime())).toBe('Feb');
    });

    it('formats long ranges with month and year', () => {
        const formatter = buildXAxisFormatter(0, 800 * DAY_MS);
        const label = formatter(new Date(2025, 6, 1).getTime());
        expect(label).toBe('Jul 25');
    });
});

describe('buildXAxisTicks', () => {
    it('keeps day ticks on unique calendar dates through DST fallback', () => {
        const fallbackStartOffset = new Date(2024, 10, 2).getTimezoneOffset();
        const fallbackEndOffset = new Date(2024, 10, 4).getTimezoneOffset();

        if (fallbackStartOffset === fallbackEndOffset) {
            return;
        }

        const startMs = new Date(2024, 10, 1, 12).getTime();
        const endMs = new Date(2024, 10, 8, 12).getTime();
        const ticks = buildXAxisTicks(startMs, endMs);
        const labels = ticks.map((tick) =>
            new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
                new Date(tick),
            ),
        );

        expect(new Set(labels).size).toBe(labels.length);
        for (const tick of ticks) {
            expect(new Date(tick).getHours()).toBe(0);
        }
    });
});
