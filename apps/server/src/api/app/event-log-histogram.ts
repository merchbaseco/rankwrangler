import { z } from 'zod';
import { appProcedure } from '@/api/trpc';
import { eventLogHistogramRanges, readEventLogHistogram } from '@/db/event-log-histogram';
import { eventLogFiltersSchema } from '@/services/event-log-filters';

const rangeKeys = Object.keys(eventLogHistogramRanges) as [
    keyof typeof eventLogHistogramRanges,
    ...(keyof typeof eventLogHistogramRanges)[],
];

const eventLogHistogramInput = eventLogFiltersSchema.omit({ since: true }).extend({
    range: z.enum(rangeKeys),
});

/** Event counts per time bucket and level over a range, under the event list's filters. */
export const eventLogHistogram = appProcedure
    .input(eventLogHistogramInput)
    .query(({ input: { range, ...filters } }) =>
        readEventLogHistogram({ accountId: 'global', filters, range })
    );
