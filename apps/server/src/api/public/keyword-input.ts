import { z } from 'zod';
import { TOP_SEARCH_TERMS_REPORT_PERIODS } from '@/db/top-search-terms/types.js';
import {
    KEYWORD_DEFAULT_HISTORY_DAYS,
    KEYWORD_DEFAULT_LIMIT,
    KEYWORD_MAX_LIMIT,
} from '@/services/keyword-intelligence-types.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportPeriod = z.enum(TOP_SEARCH_TERMS_REPORT_PERIODS).default('DAY');
const marketplaceId = z.literal(SPAPI_US_MARKETPLACE_ID).default(SPAPI_US_MARKETPLACE_ID);

const keywordWindow = {
    dataEndDate: dateString.optional(),
    dataStartDate: dateString.optional(),
    marketplaceId,
    reportPeriod,
};

const refineCompleteWindow = (
    input: { dataEndDate?: string; dataStartDate?: string },
    ctx: z.RefinementCtx
) => {
    if (Boolean(input.dataStartDate) !== Boolean(input.dataEndDate)) {
        ctx.addIssue({
            code: 'custom',
            message: 'dataStartDate and dataEndDate must be provided together.',
            path: ['dataStartDate'],
        });
    }
};

export const keywordGetInput = z
    .object({
        ...keywordWindow,
        keyword: z.string().trim().min(1).max(200),
        refresh: z.boolean().default(false),
    })
    .superRefine(refineCompleteWindow);

export const keywordSearchInput = z
    .object({
        ...keywordWindow,
        cursor: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(KEYWORD_MAX_LIMIT).default(KEYWORD_DEFAULT_LIMIT),
        maxRank: z.number().int().min(1).optional(),
        merchOnly: z.boolean().default(true),
        minRank: z.number().int().min(1).optional(),
        refresh: z.boolean().default(false),
        text: z.string().trim().min(1).max(200),
    })
    .superRefine(refineCompleteWindow);

export const keywordHistoryInput = z.object({
    keyword: z.string().trim().min(1).max(200),
    marketplaceId,
    rangeDays: z.number().int().min(7).max(365).default(KEYWORD_DEFAULT_HISTORY_DAYS),
    refresh: z.boolean().default(false),
    reportPeriod,
});
