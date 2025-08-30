import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { log } from '../../utils/logger';
import { DebugWidget } from './components/debug-widget';
import { searchInjector } from './services/search-injector';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 5 * 1000,
        },
    },
});

const App = () => {
    const [debugMode, setDebugMode] = useState(false);

    useEffect(() => {
        // Load initial debug mode state
        chrome.storage.local.get(['debugMode'], result => {
            setDebugMode(result.debugMode || false);
        });

        // Initial injection
        const runInjection = () => {
            log.debug('Running BSR injection');
            searchInjector.injectBsrBadges();
        };

        // Run after a short delay to ensure DOM is ready
        setTimeout(runInjection, 1000);

        // Watch for URL changes (navigation)
        let currentUrl = window.location.href;
        const urlChangeHandler = () => {
            if (window.location.href !== currentUrl) {
                log.info('URL changed, re-injecting badges');
                currentUrl = window.location.href;
                searchInjector.reset();
                setTimeout(runInjection, 1000);
            }
        };

        // Check for URL changes periodically
        const urlWatcher = setInterval(urlChangeHandler, 1000);

        // Also watch for popstate events (back/forward)
        window.addEventListener('popstate', () => {
            setTimeout(urlChangeHandler, 100);
        });

        return () => {
            clearInterval(urlWatcher);
        };
    }, []);

    // Separate useEffect for message listener to avoid stale closure
    useEffect(() => {
        const handleMessage = (
            request: any,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: any) => void
        ) => {
            log.debug('Message received', { request, sender });

            if (request.type === 'toggleDebugMode') {
                log.debug('Toggling debug mode via message:', request.debugMode);
                setDebugMode(request.debugMode);
                sendResponse({ success: true });
                return true; // Indicates async response
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            {debugMode && <DebugWidget />}
        </QueryClientProvider>
    );
};

export default App;
