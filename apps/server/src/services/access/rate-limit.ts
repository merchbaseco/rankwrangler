export const getDailyAllowanceRetryAfterSeconds = (now = new Date()) => {
    const nextReset = new Date(now);
    nextReset.setUTCHours(24, 0, 0, 0);
    return Math.max(1, Math.ceil((nextReset.getTime() - now.getTime()) / 1000));
};
