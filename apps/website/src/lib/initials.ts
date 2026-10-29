const whitespace = /\s+/u;

/** Up to two initials for an avatar fallback: "Ada Lovelace" → "AL". */
export const initials = (name: string) =>
    name
        .split(whitespace)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() ?? '')
        .join('');
