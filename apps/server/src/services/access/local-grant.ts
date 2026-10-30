import {
    type AccessProjectionStore,
    projectionGrantsAccess,
    ServiceAccessError,
} from '@merchbaseco/access';

export const createLocalGrantDeadline =
    (projections: AccessProjectionStore, issuer: string) => async (merchbaseUserId: string) => {
        const stored = await projections.findByIdentity({ issuer, subject: merchbaseUserId });
        if (
            stored.type !== 'active' ||
            stored.projection.merchbaseUserId !== merchbaseUserId ||
            !projectionGrantsAccess(stored.projection, Date.now())
        ) {
            throw new ServiceAccessError('access_denied');
        }
        return stored.projection.accessValidUntil;
    };
