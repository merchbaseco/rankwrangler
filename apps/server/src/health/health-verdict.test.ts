import { describe, expect, it } from 'bun:test';
import { evaluateHealth } from '@/health/health-verdict';

const now = new Date('2026-10-08T20:00:00.000Z');
const fresh = {
    'product-details': new Date('2026-10-09T03:00:00.000Z'),
    'product-history': 'nothing-due',
    'top-search-terms': new Date('2026-10-09T06:59:59.999Z'),
    'catalog-keywords': 'nothing-due',
} as const;

describe('evaluateHealth', () => {
    it('passes an idle SP-API scan because the earliest due row is still in the future', () => {
        expect(
            evaluateHealth({
                now,
                jobRunner: 'enabled',
                probe: { database: 'reachable', freshness: fresh },
            })
        ).toEqual({ status: 'ok' });
    });

    it('passes product-details exactly at its 6h slack and fails it 1ms later', () => {
        const at = (dueAt: string) =>
            evaluateHealth({
                now,
                jobRunner: 'enabled',
                probe: {
                    database: 'reachable',
                    freshness: { ...fresh, 'product-details': new Date(dueAt) },
                },
            });
        expect(at('2026-10-08T14:00:00.000Z')).toEqual({ status: 'ok' });
        expect(at('2026-10-08T13:59:59.999Z')).toEqual({
            status: 'degraded',
            failing: ['product-details'],
        });
    });

    it('fails top-search-terms when the 2026-10-04 daily window is 13h past its SLA', () => {
        const probe = {
            database: 'reachable',
            freshness: { ...fresh, 'top-search-terms': new Date('2026-10-08T06:59:59.999Z') },
        } as const;
        expect(evaluateHealth({ now, jobRunner: 'enabled', probe })).toEqual({
            status: 'degraded',
            failing: ['top-search-terms'],
        });
    });

    it('fails a check whose read did not complete', () => {
        const probe = {
            database: 'reachable',
            freshness: {
                'product-details': fresh['product-details'],
                'product-history': 'nothing-due',
                'top-search-terms': fresh['top-search-terms'],
            },
        } as const;
        expect(evaluateHealth({ now, jobRunner: 'enabled', probe })).toEqual({
            status: 'degraded',
            failing: ['catalog-keywords'],
        });
    });

    it('names only the database when Postgres is unreachable', () => {
        expect(
            evaluateHealth({ now, jobRunner: 'enabled', probe: { database: 'unreachable' } })
        ).toEqual({
            status: 'degraded',
            failing: ['database'],
        });
    });

    it('judges only the database when the job runner is disabled', () => {
        const ancient = new Date('2020-01-01T00:00:00.000Z');
        const probe = {
            database: 'reachable',
            freshness: {
                'product-details': ancient,
                'product-history': ancient,
                'top-search-terms': ancient,
                'catalog-keywords': ancient,
            },
        } as const;
        expect(evaluateHealth({ now, jobRunner: 'disabled', probe })).toEqual({ status: 'ok' });
        expect(evaluateHealth({ now, jobRunner: 'enabled', probe })).toEqual({
            status: 'degraded',
            failing: ['product-details', 'product-history', 'top-search-terms', 'catalog-keywords'],
        });
    });
});
