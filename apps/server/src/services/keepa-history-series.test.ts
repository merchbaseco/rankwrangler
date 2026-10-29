import { describe, expect, it } from 'bun:test';
import {
    buildKeepaHistorySeries,
    dateToKeepaMinute,
    decodeKeepaHistorySeries,
    decodeKeepaHistorySeriesList,
    keepaHistoryPointAt,
    keepaMinuteToDate,
    lastKeepaMinuteAt,
    parseKeepaInterleavedSeries,
    selectKeepaHistoryWindow,
} from '@/services/keepa-history-series';

const at = (keepaMinutes: number) => keepaMinuteToDate(keepaMinutes);

describe('Keepa history series encoding', () => {
    it('parses Keepa interleaved pairs, sorting and keeping the last value of a repeated minute', () => {
        expect(
            parseKeepaInterleavedSeries('price_new', -1, [300, 1_999, 100, 2_099, 300, -1, 400])
        ).toEqual({
            metric: 'price_new',
            categoryId: -1,
            keepaMinutes: [100, 300],
            values: [2_099, -1],
        });
        expect(parseKeepaInterleavedSeries('price_new', -1, [100])).toBeNull();
        expect(parseKeepaInterleavedSeries('price_new', -1, undefined)).toBeNull();
    });

    it('drops non-finite pairs', () => {
        expect(
            buildKeepaHistorySeries('bsr_main', 7, [
                [10, 5],
                [Number.NaN, 6],
                [11, Number.POSITIVE_INFINITY],
            ])
        ).toEqual({ metric: 'bsr_main', categoryId: 7, keepaMinutes: [10], values: [5] });
    });

    it('decodes negative values as missing points with their Keepa timestamp', () => {
        const series = {
            metric: 'price_new',
            categoryId: -1,
            keepaMinutes: [100, 200],
            values: [0, -2],
        };

        expect(decodeKeepaHistorySeries(series)).toEqual([
            {
                metric: 'price_new',
                categoryId: -1,
                observedAt: at(100),
                keepaMinutes: 100,
                valueInt: 0,
                isMissing: false,
            },
            {
                metric: 'price_new',
                categoryId: -1,
                observedAt: at(200),
                keepaMinutes: 200,
                valueInt: null,
                isMissing: true,
            },
        ]);
    });

    it('merges a metric across categories oldest first', () => {
        const points = decodeKeepaHistorySeriesList([
            { metric: 'bsr_category', categoryId: 9, keepaMinutes: [100, 300], values: [1, 3] },
            { metric: 'bsr_category', categoryId: 2, keepaMinutes: [200, 300], values: [2, 4] },
        ]);

        expect(points.map(point => [point.keepaMinutes, point.categoryId])).toEqual([
            [100, 9],
            [200, 2],
            [300, 2],
            [300, 9],
        ]);
    });

    it('round-trips instants through Keepa minutes', () => {
        const instant = new Date('2026-08-20T15:30:00.000Z');

        expect(keepaMinuteToDate(dateToKeepaMinute(instant))).toEqual(instant);
        expect(lastKeepaMinuteAt(new Date(instant.getTime() + 59_000))).toBe(
            dateToKeepaMinute(instant)
        );
    });
});

describe('Keepa history window selection', () => {
    const points = [100, 200, 300, 400].map(keepaMinutes => ({
        keepaMinutes,
        observedAt: at(keepaMinutes),
    }));

    it('returns the latest points up to the limit when unbounded', () => {
        expect(selectKeepaHistoryWindow(points, { limit: 2 }).map(p => p.keepaMinutes)).toEqual([
            300, 400,
        ]);
        expect(selectKeepaHistoryWindow(points, { limit: 0 })).toEqual([]);
    });

    it('returns the range plus the point in force at its start, ignoring the limit', () => {
        expect(
            selectKeepaHistoryWindow(points, { startAt: at(250), endAt: at(300), limit: 1 }).map(
                p => p.keepaMinutes
            )
        ).toEqual([200, 300]);
        expect(
            selectKeepaHistoryWindow(points, { startAt: at(200), limit: 1 }).map(
                p => p.keepaMinutes
            )
        ).toEqual([100, 200, 300, 400]);
        expect(
            selectKeepaHistoryWindow(points, { endAt: at(200), limit: 1 }).map(p => p.keepaMinutes)
        ).toEqual([100, 200]);
        expect(selectKeepaHistoryWindow(points, { startAt: at(50), limit: 1 })).toHaveLength(4);
    });

    it('finds the point in force at a minute', () => {
        expect(keepaHistoryPointAt(points, 99)).toBeUndefined();
        expect(keepaHistoryPointAt(points, 100)?.keepaMinutes).toBe(100);
        expect(keepaHistoryPointAt(points, 399)?.keepaMinutes).toBe(300);
        expect(keepaHistoryPointAt(points, 10_000)?.keepaMinutes).toBe(400);
    });
});
