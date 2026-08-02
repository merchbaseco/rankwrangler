import { createHash } from 'node:crypto';
import {
    type AccessProjection,
    type AccessProjectionStore,
    type ClerkAuthenticator,
    projectionGrantsAccess,
} from '@merchbaseco/access';

const CLERK_SUBJECT_PATTERN = /^user_[A-Za-z0-9_]+$/;
const MERCHBASE_USER_PATTERN = /^mbu_[A-Za-z0-9_]+$/;

export interface ProjectionBootstrapOptions {
    clerkSubject: string;
    merchbaseUserId: string;
}

interface ProjectionBootstrapDeps {
    authenticator: Pick<ClerkAuthenticator, 'loadProjection'>;
    issuer: string;
    now?: () => number;
    store: AccessProjectionStore;
}

export const parseProjectionBootstrapOptions = (args: string[]): ProjectionBootstrapOptions => {
    const values = new Map<string, string>();

    for (const arg of args) {
        const separator = arg.indexOf('=');
        if (!arg.startsWith('--') || separator < 0) {
            throw new Error('Expected only --name=value projection-bootstrap arguments.');
        }
        const name = arg.slice(2, separator);
        if (!['clerk-subject', 'merchbase-user-id'].includes(name) || values.has(name)) {
            throw new Error(`Unexpected or duplicate --${name}=...`);
        }
        values.set(name, arg.slice(separator + 1).trim());
    }

    const options = {
        clerkSubject: required(values, 'clerk-subject'),
        merchbaseUserId: required(values, 'merchbase-user-id'),
    };
    assertPattern(options.clerkSubject, CLERK_SUBJECT_PATTERN, 'clerk-subject');
    assertPattern(options.merchbaseUserId, MERCHBASE_USER_PATTERN, 'merchbase-user-id');
    return options;
};

export const bootstrapAccessProjection = async (
    options: ProjectionBootstrapOptions,
    deps: ProjectionBootstrapDeps
) => {
    const identity = {
        issuer: deps.issuer,
        subject: options.clerkSubject,
    };
    const loaded = await deps.authenticator.loadProjection(identity);
    const projection = loaded.projection;
    const eventId = `operator_projection_bootstrap_${fingerprint({
        identity,
        projection,
        sourceUpdatedAt: loaded.sourceUpdatedAt,
    })}`;

    await deps.store.apply(
        projection
            ? {
                  eventId,
                  projection,
                  type: 'upsert',
              }
            : {
                  eventId,
                  identity,
                  sourceUpdatedAt: loaded.sourceUpdatedAt,
                  type: 'remove',
              }
    );

    const stored = await deps.store.findByIdentity(identity);
    if (!projection) {
        if (stored.type !== 'tombstone') {
            throw new Error('Stored projection does not exactly match current Clerk metadata.');
        }
        throw new Error('Current Clerk metadata does not grant the exact requested identity.');
    }
    if (stored.type !== 'active' || !sameProjection(stored.projection, projection)) {
        throw new Error('Stored projection does not exactly match current Clerk metadata.');
    }
    if (
        projection.issuer !== identity.issuer ||
        projection.subject !== identity.subject ||
        projection.merchbaseUserId !== options.merchbaseUserId ||
        !projectionGrantsAccess(projection, (deps.now ?? Date.now)())
    ) {
        throw new Error('Current Clerk metadata does not grant the exact requested identity.');
    }

    return {
        eventFingerprint: fingerprint(eventId),
        identityFingerprint: fingerprint(identity),
        merchbaseUserFingerprint: fingerprint(options.merchbaseUserId),
        sourceUpdatedAt: projection.sourceUpdatedAt,
    };
};

const sameProjection = (left: AccessProjection, right: AccessProjection) =>
    left.access === right.access &&
    left.accessValidUntil === right.accessValidUntil &&
    left.issuer === right.issuer &&
    left.merchbaseUserId === right.merchbaseUserId &&
    left.sourceUpdatedAt === right.sourceUpdatedAt &&
    left.subject === right.subject;

const fingerprint = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

const required = (values: Map<string, string>, name: string) => {
    const value = values.get(name);
    if (!value) {
        throw new Error(`Missing --${name}=...`);
    }
    return value;
};

const assertPattern = (value: string, pattern: RegExp, name: string) => {
    if (!pattern.test(value)) {
        throw new Error(`Invalid --${name}=...`);
    }
};
