import { verifyToken } from '@clerk/backend';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { env } from '@/config/env.js';
import { validateLicense } from '@/services/license.js';

export interface ClerkUser {
    sub: string;
    email?: string;
}

interface LicenseContext {
    key: string;
    data?: {
        email: string;
        usage: number;
        usageLimit: number;
    };
}

type AuthType = 'license' | 'clerk' | 'none';

export async function createContext({ req }: CreateFastifyContextOptions) {
    const token = getBearerToken(req.headers.authorization);
    let licenseError: string | undefined;

    if (token) {
        const licenseValidation = await validateLicense(token);
        if (licenseValidation.valid) {
            const user: ClerkUser = {
                sub: 'license',
                email: licenseValidation.data?.email,
            };

            return {
                user,
                isAdmin: false,
                authType: 'license' as AuthType,
                license: {
                    key: token,
                    data: licenseValidation.data,
                },
                licenseError: undefined,
                request: req,
            };
        }

        licenseError = licenseValidation.error;
    }

    if (token) {
        if (!env.CLERK_SECRET_KEY) {
            console.warn('CLERK_SECRET_KEY not configured');
            return {
                user: null,
                isAdmin: false,
                authType: 'none' as AuthType,
                license: null,
                licenseError,
                request: req,
            };
        }

        try {
            const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
            const user: ClerkUser = {
                sub: payload.sub,
                email: payload.email as string | undefined,
            };

            const isAdmin = isAdminEmail(user.email);

            return {
                user,
                isAdmin,
                authType: 'clerk' as AuthType,
                license: null,
                licenseError: undefined,
                request: req,
            };
        } catch {
            return {
                user: null,
                isAdmin: false,
                authType: 'none' as AuthType,
                license: null,
                licenseError,
                request: req,
            };
        }
    }

    return {
        user: null,
        isAdmin: false,
        authType: 'none' as AuthType,
        license: null,
        licenseError: undefined,
        request: req,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const getBearerToken = (authorization?: string) => {
    if (!authorization) return null;
    if (!authorization.startsWith('Bearer ')) return null;
    const token = authorization.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
};

const parseAdminEmails = (value?: string | null) => {
    if (!value) return [] as string[];
    return value
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);
};

const adminEmailSet = new Set(parseAdminEmails(env.ADMIN_EMAIL));

const isAdminEmail = (email?: string) => {
    if (!email) return false;
    return adminEmailSet.has(email.trim().toLowerCase());
};
