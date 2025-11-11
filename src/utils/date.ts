import { formatInTimeZone } from 'date-fns-tz';

/**
 * Get today's date in Pacific timezone as YYYY-MM-DD string.
 * 
 * IMPORTANT: Amazon US marketplace (ATVPDKIKX0DER) uses Pacific timezone 
 * for business day boundaries. BSR ranks must be recorded using Pacific date 
 * to match Amazon's day boundaries, not UTC or server local time.
 * 
 * This ensures that:
 * - 11 PM PST on Jan 1st → recorded as Jan 1st (not Jan 2nd in UTC)
 * - 1 AM PST on Jan 2nd → recorded as Jan 2nd
 * - Automatically handles PST/PDT transitions
 * 
 * @returns Date string in YYYY-MM-DD format using Pacific timezone
 */
export function getPacificDateString(): string {
    const now = new Date();
    // Use Pacific timezone (America/Los_Angeles) - automatically handles PST/PDT transitions
    return formatInTimeZone(now, 'America/Los_Angeles', 'yyyy-MM-dd');
}

