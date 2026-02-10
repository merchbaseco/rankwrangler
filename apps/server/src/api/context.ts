import { verifyToken } from '@clerk/backend';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { env } from '@/config/env.js';

interface ClerkUser {
    sub: string;
    email?: string;
}

export async function createContext({ req }: CreateFastifyContextOptions) {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
        return { user: null, isAdmin: false, request: req };
    }

    if (!env.CLERK_SECRET_KEY) {
        console.warn('CLERK_SECRET_KEY not configured');
        return { user: null, isAdmin: false, request: req };
    }

    try {
        const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
        const user: ClerkUser = {
            sub: payload.sub,
            email: payload.email as string | undefined,
        };

        const isAdmin = isAdminEmail(user.email);

        return { user, isAdmin, request: req };
    } catch {
        return { user: null, isAdmin: false, request: req };
    }
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const getBearerToken = (authorization?: string) => {
    if (!authorization) return null;
    if (!authorization.startsWith('Bearer ')) return null;
    return authorization.slice('Bearer '.length).trim();
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
