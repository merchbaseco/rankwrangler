export const toJsonValue = (value: unknown): unknown => {
    if (value === undefined) {
        return null;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        if (value instanceof Error) {
            return {
                message: value.message,
                name: value.name,
            };
        }

        return String(value);
    }
};

export const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown job error';
};
