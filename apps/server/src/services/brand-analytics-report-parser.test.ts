import { describe, expect, it } from 'bun:test';
import { readBrandAnalyticsRows } from './brand-analytics-report-parser';

const document = JSON.stringify({
    reportSpecification: {
        reportType: 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT',
        reportOptions: { reportPeriod: 'WEEK' },
        marketplaceIds: ['ATVPDKIKX0DER'],
    },
    dataByDepartmentAndSearchTerm: [
        {
            departmentName: 'Amazon.com',
            searchTerm: 'nurse shirt {funny} "rn"',
            searchFrequencyRank: 12,
            clickedAsin: 'B0AAAAAAA1',
            clickedItemName: 'Nurse Life T-Shirt – café ☕',
            clickShareRank: 1,
            clickShare: 0.2,
            conversionShare: 0.1,
        },
        {
            departmentName: 'Amazon.com',
            searchTerm: 'nurse shirt {funny} "rn"',
            searchFrequencyRank: 12,
            clickedAsin: 'B0AAAAAAA2',
            clickedItemName: 'Scrub cap [blue]',
            clickShareRank: 2,
            clickShare: 0.1,
            conversionShare: 0.05,
        },
    ],
});

const chunked = async function* (text: string, size: number) {
    const bytes = new TextEncoder().encode(text);
    for (let start = 0; start < bytes.length; start += size) yield bytes.slice(start, start + size);
};

const read = async (chunks: AsyncIterable<Uint8Array | string>) => {
    const rows: Record<string, unknown>[] = [];
    const count = await readBrandAnalyticsRows(chunks, row => rows.push(row));
    return { rows, count };
};

describe('Brand Analytics report parser', () => {
    it('yields only the rows of the data array', async () => {
        const { rows, count } = await read(chunked(document, 1 << 16));
        expect(count).toBe(2);
        expect(rows.map(row => row.clickedAsin)).toEqual(['B0AAAAAAA1', 'B0AAAAAAA2']);
        expect(rows[0].searchTerm).toBe('nurse shirt {funny} "rn"');
    });
    it('reassembles rows and multi-byte characters split across chunks', async () => {
        for (const size of [1, 3, 7, 50]) {
            const { rows } = await read(chunked(document, size));
            expect(rows).toHaveLength(2);
            expect(rows[0].clickedItemName).toBe('Nurse Life T-Shirt – café ☕');
            expect(rows[1].clickedItemName).toBe('Scrub cap [blue]');
        }
    });
    it('fails loudly on a truncated document', async () => {
        await expect(read(chunked(document.slice(0, -20), 64))).rejects.toThrow(
            'ended before its JSON document closed'
        );
    });
});
