export class KeepaDispatchDeferredError extends Error {
    constructor() {
        super('Automatic Keepa history is no longer eligible for dispatch');
        this.name = 'KeepaDispatchDeferredError';
    }
}
