export const toUtcIsoTimestamp = (value: string | null): string | null => {
    if (!value) {
        return null;
    }

    let normalized = value.trim().replace(' ', 'T');

    if (/([+-]\d{2})$/.test(normalized)) {
        normalized = `${normalized}:00`;
    } else if (/([+-]\d{4})$/.test(normalized)) {
        normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    }

    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
        normalized = `${normalized}Z`;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
};
