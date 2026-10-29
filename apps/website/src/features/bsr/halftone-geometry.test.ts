import { describe, expect, test } from 'bun:test';
import { halftoneGeometry, halftoneValueGeometry } from './halftone-geometry';

const day = (salesRank: number, index: number) => ({
    at: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
    salesRank,
});

const ys = (path: string) =>
    path
        .slice(1)
        .split(' L')
        .map(pair => Number(pair.split(' ')[1]));

describe('halftoneGeometry', () => {
    test('returns null without a ranked sample', () => {
        expect(halftoneGeometry([], { height: 32, width: 104 })).toBeNull();
        expect(halftoneGeometry([day(0, 0)], { height: 32, width: 104 })).toBeNull();
    });

    test('a better (lower) rank sits higher, inside the mock insets', () => {
        const geometry = halftoneGeometry([9000, 3000, 1000].map(day), { height: 32, width: 104 });
        const [worst, , best] = ys(geometry?.line ?? '');
        expect(best).toBe(3);
        expect(worst).toBe(28);
        expect(geometry?.end).toEqual({ x: 103, y: 3 });
    });

    test('the area closes the exact line down to the baseline', () => {
        const geometry = halftoneGeometry([500, 400].map(day), { height: 32, width: 104 });
        expect(geometry?.area.startsWith(geometry.line)).toBe(true);
        expect(geometry?.area.endsWith('L103.0 32 L1.0 32 Z')).toBe(true);
    });

    test('one sample or a flat series draws a level line across the box', () => {
        const single = halftoneGeometry([day(700, 0)], { height: 32, width: 104 });
        expect(single?.line).toBe('M1.0 16.0 L103.0 16.0');
        const flat = halftoneGeometry([700, 700, 700].map(day), { height: 32, width: 104 });
        expect(new Set(ys(flat?.line ?? ''))).toEqual(new Set([16]));
    });
});

describe('halftoneValueGeometry', () => {
    test('a higher value sits higher', () => {
        const geometry = halftoneValueGeometry([10, 50, 90], { height: 32, width: 104 });
        const [low, , high] = ys(geometry?.line ?? '');
        expect(high).toBe(3);
        expect(low).toBe(28);
    });
});
