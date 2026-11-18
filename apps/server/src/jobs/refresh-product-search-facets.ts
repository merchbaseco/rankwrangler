import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import {
    readProductSearchFacetSnapshot,
    refreshProductSearchFacetSnapshot,
} from '@/db/product-search-facet-snapshot';
import { defineJob } from './job-router';

// Every fifteen minutes: recount Explore's default-view facets over the whole catalog. Requests
// served stale facets for up to thirty minutes before, so the snapshot is no staler. The exclusive
// queue holds one tick queued or running, so a slow pass never has others piling up.
export const refreshProductSearchFacetsJob = defineJob('refresh-product-search-facets', {
    startupSummary: "every fifteen minutes; recounts Explore's default-view facets",
})
    .input(z.object({}))
    .queue({ policy: 'exclusive' })
    .interval({ everyMs: 15 * 60_000, payload: {} })
    .work(async () => await refreshProductSearchFacetSnapshot());

/** Sends one count when no snapshot exists yet, and describes the snapshot for startup. */
export const sendMissingProductSearchFacetsRefresh = async (boss: PgBoss) => {
    const snapshot = await readProductSearchFacetSnapshot();
    if (snapshot) {
        return `Default facets every fifteen minutes (last counted ${snapshot.observedAt.toISOString()})`;
    }
    await boss.send(refreshProductSearchFacetsJob.jobName, {});
    return 'Default facets every fifteen minutes (first count queued at startup)';
};
