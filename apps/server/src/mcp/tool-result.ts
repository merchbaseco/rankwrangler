import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export const readOnlyToolAnnotations = {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
} satisfies ToolAnnotations;

export interface RankWranglerMcpError {
    code:
        | 'NOT_FOUND'
        | 'TEMPORARILY_UNAVAILABLE'
        | 'RATE_LIMITED'
        | 'INVALID_INPUT'
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'INTERNAL_ERROR';
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number;
}

export const toToolResult = (structuredContent: Record<string, unknown>) => ({
    content: [
        {
            type: 'text' as const,
            text: JSON.stringify(structuredContent),
        },
    ],
    structuredContent,
});

export const runReadOnlyTool = async (read: () => Promise<Record<string, unknown>>) => {
    try {
        return toToolResult(await read());
    } catch (error) {
        console.error('RankWrangler MCP read failed.', summarizeError(error));
        return toToolResultWithError(
            {
                error: mapMcpError(error),
            },
            true
        );
    }
};

const toToolResultWithError = (structuredContent: Record<string, unknown>, isError: boolean) => ({
    ...toToolResult(structuredContent),
    ...(isError ? { isError: true } : {}),
});

const mapMcpError = (error: unknown): RankWranglerMcpError => {
    const code = resolveErrorCode(error);
    if (code === 'NOT_FOUND') {
        return {
            code,
            message: 'Requested data was not found.',
            retryable: false,
        };
    }

    if (code === 'TIMEOUT' || code === 'SERVICE_UNAVAILABLE') {
        const retryAfterSeconds = resolveRetryAfterSeconds(error);
        return {
            code: 'TEMPORARILY_UNAVAILABLE',
            message: `Requested data is temporarily unavailable. Retry after ${retryAfterSeconds} seconds.`,
            retryable: true,
            retryAfterSeconds,
        };
    }

    if (code === 'TOO_MANY_REQUESTS') {
        const retryAfterSeconds = resolveRetryAfterSeconds(error);
        return {
            code: 'RATE_LIMITED',
            message: `Daily allowance is exhausted. Retry after ${retryAfterSeconds} seconds.`,
            retryable: true,
            retryAfterSeconds,
        };
    }

    if (code === 'BAD_REQUEST' || code === 'PARSE_ERROR') {
        return {
            code: 'INVALID_INPUT',
            message: resolvePublicMessage(error, 'The request input is invalid.'),
            retryable: false,
        };
    }

    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        return {
            code,
            message: code === 'UNAUTHORIZED' ? 'Authentication is required.' : 'Access denied.',
            retryable: false,
        };
    }

    return {
        code: 'INTERNAL_ERROR',
        message: 'RankWrangler could not complete this read.',
        retryable: false,
    };
};

const resolveErrorCode = (error: unknown) => {
    if (!error || typeof error !== 'object') {
        return null;
    }
    if ('code' in error && typeof error.code === 'string') {
        return error.code;
    }
    if ('data' in error && error.data && typeof error.data === 'object') {
        const code = (error.data as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
    }
    return null;
};

const resolvePublicMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.length < 240) {
        return error.message;
    }
    return fallback;
};

const resolveRetryAfterSeconds = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const match = RETRY_AFTER_PATTERN.exec(message);
    return match?.[1] ? Number.parseInt(match[1], 10) : 60;
};

const RETRY_AFTER_PATTERN = /Retry after (\d+) seconds?/i;

const summarizeError = (error: unknown) => ({
    code: resolveErrorCode(error) ?? 'UNKNOWN',
    name: error instanceof Error ? error.name : 'UnknownError',
});
