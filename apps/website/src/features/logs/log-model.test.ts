import { describe, expect, test } from 'bun:test';
import { type EventLogRow, getTargetLabel, logSubjectHref, resolveLogSubject } from './log-model';

describe('log subjects', () => {
    test('a keyword event opens Keywords filtered to its term', () => {
        const subject = resolveLogSubject(row({ detailsJson: { keyword: 'cat mom' } }));

        expect(subject).toEqual({ keyword: 'cat mom', kind: 'keyword' });
        expect(logSubjectHref(subject)).toBe('/keywords?q=cat%20mom');
    });

    test('a product event opens its Product page, naming non-US marketplaces', () => {
        const us = resolveLogSubject(
            row({ asin: 'B0TEST1234', marketplaceId: 'ATVPDKIKX0DER', primitiveType: 'product' })
        );
        const uk = resolveLogSubject(
            row({ asin: 'B0TEST1234', marketplaceId: 'A1F83G8C2ARO7P', primitiveType: 'history' })
        );

        expect(logSubjectHref(us)).toBe('/products/B0TEST1234');
        expect(logSubjectHref(uk)).toBe('/products/B0TEST1234?marketplace=A1F83G8C2ARO7P');
        expect(getTargetLabel(row({ asin: 'B0TEST1234', marketplaceId: 'A1F83G8C2ARO7P' }))).toBe(
            'B0TEST1234 · A1F83G8C2ARO7P'
        );
    });

    test('a job event has nothing to open and names its job', () => {
        const log = row({ jobName: 'process-spapi-sync-queue', primitiveType: 'job' });

        expect(logSubjectHref(resolveLogSubject(log))).toBeNull();
        expect(getTargetLabel(log)).toBe('process-spapi-sync-queue');
    });
});

const row = (overrides: Partial<EventLogRow>): EventLogRow =>
    ({
        action: 'test.action',
        asin: null,
        detailsJson: {},
        id: '00000000-0000-0000-0000-000000000000',
        jobName: null,
        level: 'info',
        marketplaceId: null,
        message: 'message',
        occurredAt: '2026-10-27T12:00:00.000Z',
        primitiveType: 'keyword',
        status: 'success',
        ...overrides,
    }) as EventLogRow;
