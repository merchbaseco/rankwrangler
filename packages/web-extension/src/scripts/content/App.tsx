import { useEffect, useState } from 'react';
import { searchInjector } from './services/search-injector';

const App = () => {

    useEffect(() => {
        console.log('RankWrangler: Content script App.tsx loaded');
        console.log('RankWrangler: BSR enhancement active');

        // Initial injection
        const runInjection = () => {
            console.log('RankWrangler: Running BSR injection...');
            searchInjector.injectBsrBadges();
        };

        // Run after a short delay to ensure DOM is ready
        setTimeout(runInjection, 1000);

        // Watch for URL changes (navigation)
        let currentUrl = window.location.href;
        const urlChangeHandler = () => {
            if (window.location.href !== currentUrl) {
                console.log('RankWrangler: URL changed, resetting and re-injecting...');
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
            console.log('RankWrangler: Message Received', request, sender, sendResponse);
        });

        return () => {
            clearInterval(urlWatcher);
        };
    }, []);

    return null;
};

export default App;
