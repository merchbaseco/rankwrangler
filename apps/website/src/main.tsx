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

if (!publishableKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

createRoot(rootElement).render(
    <StrictMode>
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
    </StrictMode>
);
