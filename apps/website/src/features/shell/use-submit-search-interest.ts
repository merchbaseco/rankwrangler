import { useCallback } from 'react';
import { api } from '@/lib/trpc';

const asinPattern = /^B0[A-Z0-9]{8}$/iu;

/**
 * ⏎ in the banner search: record the phrase as keyword interest
 * (`keywordTrack`), the one explicit act that tracks a searched keyword. The
 * live as-you-type search reads with `recordInterest: false`, so prefixes and
 * stray keys never become keywords. ASIN lookups are not keywords.
 */
export const useSubmitSearchInterest = () => {
    const { mutate } = api.api.app.keywordTrack.useMutation({
        onError: error => console.error('Recording the searched keyword failed', error),
    });
    return useCallback(
        (value: string) => {
            const term = value.trim();
            if (term && !asinPattern.test(term)) {
                mutate({ term });
            }
        },
        [mutate]
    );
};
