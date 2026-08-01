import { ServiceAccessError } from '@merchbaseco/access';
import { getConfiguredRankWranglerAccess } from './rankwrangler-access';

export type JobAccessResult = { kind: 'allowed' } | { kind: 'denied' } | { kind: 'unavailable' };

export const evaluateUserOwnedJobAccess = async (
    ownerMerchbaseUserId: string | undefined
): Promise<JobAccessResult> => {
    if (!ownerMerchbaseUserId) {
        return { kind: 'allowed' };
    }

    try {
        await getConfiguredRankWranglerAccess().sessionAccess.evaluateAccess(ownerMerchbaseUserId);
        return { kind: 'allowed' };
    } catch (error) {
        if (error instanceof ServiceAccessError && error.code === 'access_denied') {
            return { kind: 'denied' };
        }
        return { kind: 'unavailable' };
    }
};
