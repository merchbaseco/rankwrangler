import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { applyDensity, readDensity } from '@/lib/density';
import { applyTheme, readThemePreference } from '@/lib/theme';
import { TRPCProvider } from '@/lib/trpc-provider';
import '@fontsource-variable/onest/index.css';
import '@fontsource-variable/geist-mono/index.css';
import './styles/global.css';

// Apply the saved theme and density before first paint so nothing flashes or jumps.
applyTheme(readThemePreference());
applyDensity(readDensity());

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

createRoot(rootElement).render(
    <StrictMode><TRPCProvider><App /></TRPCProvider></StrictMode>
);
