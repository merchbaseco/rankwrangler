import { z } from 'zod';
import { appProcedure } from '@/api/trpc';
import { productSearchInput } from '@/api/product-search-input';
import { recordProductSearchInterest } from '@/db/product-search-interest';

export const keywordTrack = appProcedure
    .input(
        z.object({
            term: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .refine(
                    term => !/^B0[A-Z0-9]{8}$/iu.test(term),
                    'Enter a keyword phrase rather than an ASIN'
                ),
        })
    )
    .mutation(({ input }) =>
        recordProductSearchInterest(productSearchInput.parse({ term: input.term }))
    );
