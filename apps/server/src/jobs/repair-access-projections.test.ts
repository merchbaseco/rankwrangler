import { describe, expect, it, mock } from 'bun:test';
import { ServiceAccessError } from '@merchbaseco/access';
import { repairAccessProjections } from './repair-access-projections';

describe('repairAccessProjections', () => {
    it('refreshes every explicitly mapped service account and records denied/unavailable outcomes', async () => {
        const refreshAccess = mock(async () => ({}))
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(new ServiceAccessError('access_denied'))
            .mockRejectedValueOnce(new ServiceAccessError('access_unavailable'));

        const result = await repairAccessProjections({
            findMappedUsers: mock(async () => ['mbu_one', 'mbu_two', 'mbu_three']),
            refreshAccess,
        });

        expect(refreshAccess).toHaveBeenCalledTimes(3);
        expect(result).toEqual({
            didWork: true,
            denied: 1,
            refreshed: 1,
            unavailable: 1,
        });
    });

    it('does not invent a mapping when no service account is mapped', async () => {
        const refreshAccess = mock();

        const result = await repairAccessProjections({
            findMappedUsers: mock(async () => []),
            refreshAccess,
        });

        expect(refreshAccess).not.toHaveBeenCalled();
        expect(result).toEqual({
            didWork: false,
            denied: 0,
            refreshed: 0,
            unavailable: 0,
        });
    });
});
