import type { z } from 'zod';

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
