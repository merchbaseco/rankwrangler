/** How long ago an instant was, coarsely: minutes, then hours, then days. Null stays null. */
export const formatAge = (iso: string | null, now = Date.now()) => {
    if (!iso) {
        return null;
    }
    const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};
