/** Clock arithmetic shared by the builders. Every timestamp is an offset from `now`. */

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const shiftMs = (from: Date, deltaMs: number) => new Date(from.getTime() + deltaMs);

export const shiftDays = (from: Date, deltaDays: number) => shiftMs(from, deltaDays * DAY_MS);

/** `YYYY-MM-DD` in UTC, the form the Top Search Terms tables store. */
export const toDayLabel = (date: Date) => date.toISOString().slice(0, 10);

export const shiftDayLabel = (dayLabel: string, deltaDays: number) =>
    toDayLabel(shiftDays(new Date(`${dayLabel}T00:00:00Z`), deltaDays));
