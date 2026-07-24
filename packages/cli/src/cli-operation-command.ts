import type { createRankWranglerClient } from '@rankwrangler/http-client';

type CliFail = (code: string, message: string, details?: unknown) => never;

export const runOperationGetCommand = async (
    args: string[],
    client: ReturnType<typeof createRankWranglerClient>,
    fail: CliFail
): Promise<unknown> => {
    if (args.length !== 1) {
        fail('INVALID_INPUT', 'operations get requires exactly one id');
    }

    return await client.operation.get.query({ id: args[0] });
};
