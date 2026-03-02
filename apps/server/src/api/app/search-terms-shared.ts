import { z } from 'zod';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
export const US_MARKETPLACE_ID = SPAPI_US_MARKETPLACE_ID;

export const searchTermsBaseInput = z
    .object({
        dataEndDate: z.string().regex(dateRegex).optional(),
        dataStartDate: z.string().regex(dateRegex).optional(),
        marketplaceId: z.literal(US_MARKETPLACE_ID).default(US_MARKETPLACE_ID),
        reportPeriod: z.enum(['MONTH', 'WEEK']).default('MONTH'),
    })
    .refine(
        input =>
            (input.dataStartDate && input.dataEndDate) ||
            (!input.dataStartDate && !input.dataEndDate),
        {
            message: 'dataStartDate and dataEndDate must be provided together.',
            path: ['dataStartDate'],
        }
    );

export const resolveBaDateWindow = (input: { dataStartDate?: string; dataEndDate?: string }) => {
    if (input.dataStartDate && input.dataEndDate) {
        if (input.dataStartDate > input.dataEndDate) {
            throw new Error('dataStartDate must be less than or equal to dataEndDate.');
        }

        return {
            dataEndDate: input.dataEndDate,
            dataStartDate: input.dataStartDate,
        };
    }

    return getDefaultPreviousMonthDateWindow();
};

const getDefaultPreviousMonthDateWindow = () => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonthEnd = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000);
    const previousMonthStart = new Date(
        Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1)
    );

    return {
        dataEndDate: formatDate(previousMonthEnd),
        dataStartDate: formatDate(previousMonthStart),
    };
};

const formatDate = (value: Date) => value.toISOString().slice(0, 10);
