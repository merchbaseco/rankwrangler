/** Every admin metrics read polls while Settings is open, and stops in the background. */
export const metricsQueryOptions = {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
} as const;

/** Reads a realtime subscription refreshes: fresh until invalidated, never on an interval. */
export const eventDrivenQueryOptions = {
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
} as const;
