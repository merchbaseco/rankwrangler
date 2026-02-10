import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { TRPCProvider } from './lib/trpc-provider';
import '@fontsource/sora/400.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './styles/global.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

function MissingConfig() {
    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
                <div className="rounded-lg border bg-white p-6 shadow-sm">
                    <h1 className="text-xl font-semibold">RankWrangler website misconfigured</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Missing <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code>.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Fix: add it to <code className="font-mono">/Users/zknicker/srv/rankwrangler/.env</code> and redeploy.
                    </p>
                </div>
            </div>
        </div>
    );
}

createRoot(rootElement).render(
    <StrictMode>
        {publishableKey ? (
            <ClerkProvider publishableKey={publishableKey}>
                <SignedIn>
                    <TRPCProvider>
                        <App />
                    </TRPCProvider>
                </SignedIn>
                <SignedOut>
                    <div className="min-h-screen bg-background">
                        <div className="flex min-h-screen items-center justify-center">
                            <SignIn />
                        </div>
                    </div>
                </SignedOut>
            </ClerkProvider>
        ) : (
            <MissingConfig />
        )}
    </StrictMode>
);
