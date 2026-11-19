import type { z } from 'zod';

/**
 * Fields agents reach for that RankWrangler names differently, each with the fields that replace
 * it, best first. An error for an unknown or misplaced field names the first replacement the
 * operation accepts. These are hints only, never accepted aliases.
 */
const REPLACEMENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
    marketplaceIds: ['marketplaceId'],
    products: ['asins'],
    asin: ['asins'],
    asins: ['asin'],
    text: ['term'],
    query: ['term'],
    q: ['term'],
    search: ['term'],
    keyword: ['term'],
    term: ['keyword'],
    monthlySold: ['boughtInPastMonth'],
};

type FieldsByOperation<Operation extends string> = Readonly<Record<Operation, readonly string[]>>;

/**
 * The error for keys a strict operation object does not declare, with a replacement hint per key
 * where one exists for the operation the input names.
 */
export const unknownFieldError =
    <Operation extends string>(fieldsByOperation: FieldsByOperation<Operation>) =>
    (issue: { code?: string; keys?: string[]; input?: unknown }) => {
        if (issue.code !== 'unrecognized_keys' || !issue.keys) return undefined;
        const allowed = allowedFields(fieldsByOperation, issue.input);
        return issue.keys
            .map(key => `${key} is not a recognized field${hint(key, allowed)}`)
            .join('. ');
    };

/** Rejects declared fields the input's operation does not take, naming a replacement if any. */
export const rejectFieldsOutsideOperation = <Operation extends string>(
    input: { operation: Operation } & Record<string, unknown>,
    context: z.RefinementCtx,
    fieldsByOperation: FieldsByOperation<Operation>
) => {
    const allowed = allowedFields(fieldsByOperation, input);
    for (const [field, value] of Object.entries(input)) {
        if (value !== undefined && !allowed.has(field)) {
            context.addIssue({
                code: 'custom',
                message: `${field} is not accepted for ${input.operation}${hint(field, allowed)}`,
                path: [field],
            });
        }
    }
};

const allowedFields = <Operation extends string>(
    fieldsByOperation: FieldsByOperation<Operation>,
    input: unknown
) => {
    const operation =
        input && typeof input === 'object' && 'operation' in input ? input.operation : undefined;
    const fields =
        typeof operation === 'string' && Object.hasOwn(fieldsByOperation, operation)
            ? fieldsByOperation[operation as Operation]
            : Object.values<readonly string[]>(fieldsByOperation).flat();
    return new Set(['operation', ...fields]);
};

const hint = (field: string, allowed: ReadonlySet<string>) => {
    const replacement = REPLACEMENT_FIELDS[field]?.find(candidate => allowed.has(candidate));
    return replacement ? `; use ${replacement}` : '';
};
