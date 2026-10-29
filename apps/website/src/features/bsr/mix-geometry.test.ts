import { describe, expect, test } from 'bun:test';
import { mixShares } from './mix-geometry';

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe('mixShares', () => {
    test('splits proportionally', () => {
        expect(mixShares([1, 3])).toEqual([0.25, 0.75]);
    });

    test('lifts a tiny non-zero count to the minimum and keeps the sum at 1', () => {
        const shares = mixShares([1, 999, 0], 0.05);
        expect(shares[0]).toBe(0.05);
        expect(shares[2]).toBe(0);
        expect(sum(shares)).toBeCloseTo(1);
    });

    test('nothing counted is all zero', () => {
        expect(mixShares([0, 0])).toEqual([0, 0]);
    });
});
