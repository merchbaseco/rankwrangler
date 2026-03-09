import { CliStorageError } from './cli-config';

type CliSuccess<T> = {
    ok: true;
    data: T;
};

type CliFailure = {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};

const OUTPUT_PRETTY = true;

export const printSuccess = <T>(data: T) => {
    const envelope: CliSuccess<T> = {
        ok: true,
        data,
    };

    console.log(JSON.stringify(envelope, null, OUTPUT_PRETTY ? 2 : undefined));
};

export const fail = (code: string, message: string, details?: unknown): never => {
    const envelope: CliFailure = {
        ok: false,
        error: {
            code,
            message,
            ...(details !== undefined ? { details } : {}),
        },
    };

    console.error(JSON.stringify(envelope, null, OUTPUT_PRETTY ? 2 : undefined));
    process.exit(1);
};

export const resolveError = (error: unknown) => {
    if (error instanceof CliStorageError) {
        return {
            code: error.code,
            message: error.message,
            details: error.details,
        };
    }

    if (error && typeof error === 'object' && 'data' in error) {
        const data = (error as { data?: { code?: string; httpStatus?: number } }).data;
        if (data?.code) {
            return {
                code: data.code,
                message: error instanceof Error ? error.message : 'Request failed',
                details: data.httpStatus ? { httpStatus: data.httpStatus } : undefined,
            };
        }
    }

    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string') {
            return {
                code: 'REQUEST_FAILED',
                message,
            };
        }
    }

    return {
        code: 'UNKNOWN_ERROR',
        message: 'Unknown error',
    };
};
