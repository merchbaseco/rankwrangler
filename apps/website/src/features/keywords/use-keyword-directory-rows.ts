import { useCallback } from 'react';
import { api, type RouterInputs } from '@/lib/trpc';

/** Imperative `keywordDirectoryRows` read for realtime patches; never cached on its own. */
export const useKeywordDirectoryRows = () => {
    const utils = api.useUtils();
    return useCallback(
        (input: RouterInputs['api']['app']['keywordDirectoryRows']) =>
            utils.client.api.app.keywordDirectoryRows.query(input),
        [utils]
    );
};
