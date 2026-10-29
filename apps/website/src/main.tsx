import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { DevAutoSignIn } from '@/components/auth/dev-auto-sign-in';
import { applyDensity, readDensity } from '@/lib/density';
import { applyTheme, readThemePreference } from '@/lib/theme';
import { TRPCProvider } from '@/lib/trpc-provider';
import '@fontsource-variable/onest/index.css';
import '@fontsource-variable/geist-mono/index.css';
import './styles/global.css';

// Apply the saved theme and density before first paint so nothing flashes or jumps.
applyTheme(readThemePreference());
applyDensity(readDensity());

const publishableKey = import.meta.env.VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

const MissingConfig = () => (
    <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-xl" data-selectable-text>
            <h1 className="font-semibold">RankWrangler website misconfigured</h1>
            <p className="mt-2 text-muted">
                Missing <code>VITE_MERCHBASE_CLERK_PUBLISHABLE_KEY</code>. The value comes from
                .env.schema through <code>varlock run</code>; start the website with{' '}
                <code>bun run dev</code>.
            </p>
        </div>
    </main>
);

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
                    <div className="flex min-h-screen items-center justify-center">
                        <DevAutoSignIn />
                        <SignIn />
                    </div>
                </SignedOut>
            </ClerkProvider>
        ) : (
            <MissingConfig />
        )}
    </StrictMode>
);
