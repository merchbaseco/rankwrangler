import type { z } from 'zod';
import { productGetManyIncludeInput } from '@/api/public/product-input';

export const rejectFieldsOutsideOperation = <Operation extends string>(
    input: { operation: Operation } & Record<string, unknown>,
    context: z.RefinementCtx,
    fieldsByOperation: Record<Operation, string[]>
) => {
    const allowedFields = new Set(['operation', ...fieldsByOperation[input.operation]]);
    for (const [field, value] of Object.entries(input)) {
        if (value !== undefined && !allowedFields.has(field)) {
            context.addIssue({
                code: 'custom',
                message: `${field} is not accepted for ${input.operation}`,
                path: [field],
            });
        }
    }
};

/** getMany accepts only its own includes; marketData stays get-only. */
export const rejectGetManyOnlyIncludes = (
    input: { operation: string; include?: readonly string[] },
    context: z.RefinementCtx
) => {
    if (input.operation !== 'getMany' || !input.include) {
        return;
    }
    const parsed = productGetManyIncludeInput.safeParse(input.include);
    for (const issue of parsed.error?.issues ?? []) {
        context.addIssue({
            code: 'custom',
            message: issue.message,
            path: ['include', ...issue.path],
        });
    }
};
