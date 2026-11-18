import { useEffect, useRef } from 'react';
import { api } from '@/lib/trpc';

/**
 * Background jobs write logs in bursts. Coalesce `activity.created` into at most one refresh a
 * second of the event list and one every fifteen seconds of its histogram (a bucket gaining a few
 * events between refreshes is not worth a read per second), never cancel a refresh already
 * running, and mark other filters' cached pages stale for when they are shown. Paused (not live)
 * unsubscribes; resubscribing resyncs once.
 */
export const useEventLogCreated = (enabled: boolean) => {
    const utils = api.useUtils();
    const listTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const histogramTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            for (const timer of [listTimer, histogramTimer]) {
                if (timer.current) {
                    clearTimeout(timer.current);
                }
                timer.current = null;
            }
        },
        []
    );
    api.api.app.activity.created.useSubscription(undefined, {
        enabled,
        onData: () => {
            const options = { cancelRefetch: false };
            if (!listTimer.current) {
                listTimer.current = setTimeout(() => {
                    listTimer.current = null;
                    utils.api.app.eventLogs
                        .invalidate(undefined, undefined, options)
                        .catch(() => undefined);
                }, listCoalesceMs);
            }
            if (!histogramTimer.current) {
                histogramTimer.current = setTimeout(() => {
                    histogramTimer.current = null;
                    utils.api.app.eventLogHistogram
                        .invalidate(undefined, undefined, options)
                        .catch(() => undefined);
                }, histogramCoalesceMs);
            }
        },
    });
};

const listCoalesceMs = 1000;
const histogramCoalesceMs = 15_000;
