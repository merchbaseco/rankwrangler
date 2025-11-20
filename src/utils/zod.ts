import { z } from 'zod';

/**
 * Format Zod error messages into a single string
 */
export function formatZodErrorMessage(zodError: z.ZodError): string {
    return zodError.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
}

/**
 * Format Zod validation errors into an array of structured objects
 */
export function formatZodValidationErrors(zodError: z.ZodError) {
    return zodError.issues.map(e => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
    }));
}

/**
 * Check if a Zod error is related to multiple display group ranks violation
 */
export function isMultipleDisplayGroupRanksError(zodError: z.ZodError): boolean {
    return zodError.issues.some(
        e =>
            e.path.includes('salesRanks') &&
            e.path.includes('displayGroupRanks') &&
            e.message.includes('at most one')
    );
}

