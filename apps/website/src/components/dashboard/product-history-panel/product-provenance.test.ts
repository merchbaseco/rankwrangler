import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildProviderProvenanceRows, type ProviderProvenance } from './product-provenance';
import { ProductProvenanceTooltip } from './product-provenance-tooltip';

describe('Product provider provenance read model', () => {
    it('keeps timestamps, supplied data, errors, and retry timing available to an accessible tooltip', () => {
        const provenance: ProviderProvenance = {
            lastAttemptAt: '2026-08-06T12:00:00.000Z',
            lastSuccessAt: '2026-08-06T11:00:00.000Z',
            sourceObservedAt: '2026-08-06T10:00:00.000Z',
            suppliedDataCategories: ['listing', 'category', 'sales rank'],
            latestError: 'Request throttled',
            retryAt: '2026-08-06T12:05:00.000Z',
        };

        expect(buildProviderProvenanceRows(provenance)).toEqual([
            { label: 'Last attempt', value: '2026-08-06T12:00:00.000Z' },
            { label: 'Last successful fetch', value: '2026-08-06T11:00:00.000Z' },
            { label: 'Source observation', value: '2026-08-06T10:00:00.000Z' },
            { label: 'Supplied data', value: 'listing, category, sales rank' },
            { label: 'Latest error', value: 'Request throttled' },
            { label: 'Retry', value: '2026-08-06T12:05:00.000Z' },
        ]);
    });

    it('uses explicit unavailable values when optional provider diagnostics are absent', () => {
        expect(
            buildProviderProvenanceRows({
                lastAttemptAt: null,
                lastSuccessAt: null,
                sourceObservedAt: null,
                suppliedDataCategories: [],
                latestError: null,
                retryAt: null,
            })
        ).toEqual([
            { label: 'Last attempt', value: 'Unavailable' },
            { label: 'Last successful fetch', value: 'Unavailable' },
            { label: 'Source observation', value: 'Unavailable' },
            { label: 'Supplied data', value: 'Unavailable' },
        ]);
    });

    it('exposes provenance through an accessible tooltip trigger', () => {
        const markup = renderToStaticMarkup(
            createElement(ProductProvenanceTooltip, {
                provenance: {
                    spApi: createProviderProvenance(),
                    keepa: createProviderProvenance(),
                },
            })
        );

        expect(markup).toContain('aria-label="View Product provider provenance"');
    });
});

const createProviderProvenance = () => ({
    lastAttemptAt: null,
    lastSuccessAt: null,
    sourceObservedAt: null,
    suppliedDataCategories: [],
    latestError: null,
    retryAt: null,
});
