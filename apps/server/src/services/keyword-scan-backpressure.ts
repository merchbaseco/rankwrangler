// Producers (Ads mining and autocomplete) stop admitting new sources while queued scan work
// exceeds this many days of background SP-API capacity. Already-saved stages still finish.
export const SCAN_BACKLOG_DAYS = 2;
// Share of the background rate expected to produce accepted pages after retries, cooldowns and
// foreground demand. A planning assumption from the October capacity model, not a measurement.
export const SCAN_PRODUCTIVE_SHARE = 0.7;

export const scanBackpressure = (input: { queuedPages: number; backgroundRps: number }) => {
    const pagesPerDay = Math.max(1, input.backgroundRps * 86_400 * SCAN_PRODUCTIVE_SHARE);
    return {
        queuedPages: input.queuedPages,
        pagesPerDay: Math.round(pagesPerDay),
        producersOpen: input.queuedPages <= pagesPerDay * SCAN_BACKLOG_DAYS,
    };
};
