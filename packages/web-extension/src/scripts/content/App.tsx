import { useEffect } from 'react';
import { log } from '../../utils/logger';
import { searchInjector } from './services/search-injector';

const App = () => {
    useEffect(() => {
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

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            log.debug('Message received', { request, sender });
        });

        return () => {
            clearInterval(urlWatcher);
        };
    }, []);

    return null;
};

export default App;
