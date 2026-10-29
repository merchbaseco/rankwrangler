import { describe, expect, test } from 'bun:test';
import {
    bandLevels,
    bandMeter,
    bandValueIndex,
    dotMatrixGeometry,
    seriesLevels,
} from './dot-matrix-geometry';

const dots = (path: string) => path.split('M').filter(Boolean).length;

describe('dotMatrixGeometry', () => {
    test('lays a gap-spaced grid and lights each column from the bottom', () => {
        const band = dotMatrixGeometry([1, 0.5], { height: 24, width: 12 });
        expect(band.columns).toBe(2);
        expect(dots(band.on[0]?.d ?? '')).toBe(4 + 2);
        expect(dots(band.off)).toBe(2);
        expect(band.viewBox).toBe('0 0 12 24');
    });

    test('a present value lights at least one dot; null lights none', () => {
        const band = dotMatrixGeometry([0, null], { height: 24, width: 12 });
        expect(dots(band.on[0]?.d ?? '')).toBe(1);
        expect(dots(band.off)).toBe(3 + 4);
    });

    test('groups lit dots by key in first-seen order', () => {
        const band = dotMatrixGeometry([1, 1, 1], {
            height: 12,
            keys: ['elite', 'hot', 'elite'],
            width: 18,
        });
        expect(band.on.map(group => group.key)).toEqual(['elite', 'hot']);
        expect(dots(band.on[0]?.d ?? '')).toBe(4);
    });

    test('stretches fewer values across more columns', () => {
        const band = dotMatrixGeometry([1, 0], { height: 6, width: 24 });
        expect(band.columns).toBe(4);
        expect(dots(band.on[0]?.d ?? '')).toBe(4);
    });
});

describe('bandLevels', () => {
    test('scales by the largest count on a square root', () => {
        expect(bandLevels([0, 25, 100])).toEqual([0, 0.5, 1]);
        expect(bandLevels([0, 0])).toEqual([0, 0]);
    });
});

describe('bandMeter', () => {
    test('lights columns up to the share', () => {
        expect(bandMeter(0.5, 4)).toEqual([1, 1, null, null]);
        expect(bandMeter(2, 2)).toEqual([1, 1]);
        expect(bandMeter(null)).toEqual([]);
    });
});

describe('seriesLevels', () => {
    test('scales a series between a visible floor and full', () => {
        expect(seriesLevels([10, 20, 30])).toEqual([0.12, 0.56, 1]);
        expect(seriesLevels([5, 5])).toEqual([1, 1]);
        expect(seriesLevels([])).toEqual([]);
    });
});

describe('bandValueIndex', () => {
    test('maps a pointer x to the value its dot column draws', () => {
        expect(bandValueIndex(0, { columns: 10, count: 5 })).toBe(0);
        expect(bandValueIndex(31, { columns: 10, count: 5 })).toBe(2);
        expect(bandValueIndex(999, { columns: 10, count: 5 })).toBe(4);
        expect(bandValueIndex(-1, { columns: 10, count: 5 })).toBeNull();
        expect(bandValueIndex(5, { columns: 10, count: 0 })).toBeNull();
    });
});
