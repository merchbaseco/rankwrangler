import { describe, expect, test } from 'bun:test';
import { jobFamilies, jobRunFilter, outcomeOfStat, withTimeDomainLabel } from './job-run-filters';

describe('withTimeDomainLabel', () => {
    test('returns the base label without a time domain', () => {
        expect(withTimeDomainLabel('Keepa Fetches', undefined)).toBe('Keepa Fetches');
        expect(withTimeDomainLabel('Keepa Fetches', '   ')).toBe('Keepa Fetches');
    });

    test('appends the time domain when provided', () => {
        expect(withTimeDomainLabel('Keepa Fetches', '24hr')).toBe('Keepa Fetches (24hr)');
    });
});

describe('job run filters', () => {
    test('an outcome narrows the family to that status', () => {
        expect(jobRunFilter(jobFamilies.spapi.jobNames, 'failed')).toEqual({
            jobNames: ['process-spapi-sync-queue'],
            status: 'failed',
        });
        expect(jobRunFilter(jobFamilies.spapi.jobNames, 'all')).toEqual({
            jobNames: ['process-spapi-sync-queue'],
        });
    });

    test('stat labels map to the outcome they count', () => {
        expect(outcomeOfStat('Job Successes')).toBe('success');
        expect(outcomeOfStat('SP-API Jobs Failed')).toBe('failed');
        expect(outcomeOfStat('Facets Errors')).toBe('failed');
        expect(outcomeOfStat('Keepa Fetches')).toBe('all');
    });
});
