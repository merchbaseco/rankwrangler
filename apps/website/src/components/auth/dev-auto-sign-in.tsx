import { useSignIn } from '@clerk/clerk-react';
import { useEffect, useRef } from 'react';

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const isDevAutoSignInEnabled =
    import.meta.env.DEV && import.meta.env.VITE_DEV_CLERK_AUTO_SIGN_IN === 'true';

export const DevAutoSignIn = () => {
    const hasAttemptedRef = useRef(false);
    const { isLoaded, signIn, setActive } = useSignIn();

    useEffect(() => {
        if (!isDevAutoSignInEnabled || !isLoaded || !signIn) {
            return;
        }
        if (hasAttemptedRef.current) {
            return;
        }

        hasAttemptedRef.current = true;

        void requestAndActivateSession({
            signIn,
            setActive,
        });
    }, [isLoaded, setActive, signIn]);

    return null;
};

const requestAndActivateSession = async ({
    signIn,
    setActive,
}: {
    signIn: NonNullable<ReturnType<typeof useSignIn>['signIn']>;
    setActive: NonNullable<ReturnType<typeof useSignIn>['setActive']>;
}) => {
    try {
        const response = await fetch(`${apiBaseUrl}/api/api.public.dev.createClerkSignInToken`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: null }),
        });

        const payload = (await response.json()) as DevSignInTokenResponse;
        const ticket = payload.result?.data?.ticket ?? payload.result?.data?.json?.ticket;
        if (!response.ok || typeof ticket !== 'string' || ticket.length === 0) {
            console.error('[DevAutoSignIn] Failed to get dev Clerk sign-in token', payload);
            return;
        }

        const signInAttempt = await signIn.create({
            strategy: 'ticket',
            ticket,
        });
        if (signInAttempt.status !== 'complete' || !signInAttempt.createdSessionId) {
            console.error('[DevAutoSignIn] Clerk sign-in attempt did not complete', signInAttempt);
            return;
        }

        await setActive({ session: signInAttempt.createdSessionId });
    } catch (error) {
        console.error('[DevAutoSignIn] Unexpected error while auto-signing in', error);
    }
};

type DevSignInTokenResponse = {
    result?: {
        data?: {
            ticket?: string;
            json?: {
                ticket?: string;
            };
        };
    };
};
