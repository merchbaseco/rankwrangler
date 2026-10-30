import { z } from 'zod';
import { appKeywordDirectoryInput, keywordDirectoryView } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectoryWithDetail } from '@/db/keyword-directory';

/**
 * Re-reads changed rows at a loaded page's view, enriched exactly like `keywordDirectory`, so a
 * realtime patch replaces a row with the same shape the screen renders.
 */
export const keywordDirectoryRows = appProcedure
    .input(
        z.object({
            terms: z.array(z.string().min(1).max(200)).min(1).max(100),
            view: keywordDirectoryView,
        })
    )
    .query(async ({ input }) => {
        const empty = appKeywordDirectoryInput.parse({});
        return (await readKeywordDirectoryWithDetail(empty, input)).items;
    });
