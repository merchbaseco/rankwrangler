import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import styles from '@/styles/index.css?inline';
import { log } from '../../utils/logger';
import App from './app';

const isProduction: boolean = process.env.NODE_ENV === 'production';
const ROOT_ID = 'rankwrangler-content-root';

const injectReact = (rootId: string): void => {
    try {
        const container = document.createElement('div');
        document.body.appendChild(container);

        if (container) {
            container.id = rootId;
            container.style.position = 'inherit';
            container.style.zIndex = '2147483666';
        }

        if (isProduction) {
            log.ready('Content script loaded (production)');
            container.attachShadow({ mode: 'open' });
        } else {
            log.ready('Content script loaded (development)');
        }

        const target: ShadowRoot | HTMLElement = isProduction ? container.shadowRoot : container;

        const root = createRoot(target);

        root.render(
            <StrictMode>
                {isProduction && <style>{styles.toString()}</style>}
                <App />
            </StrictMode>
        );
    } catch (error) {
        log.error('Failed to inject React:', error);
    }
};

// Add ping response listener for popup status detection
chrome.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
    if (message.type === 'ping') {
        sendResponse({ alive: true });
        return true;
    }
});

injectReact(ROOT_ID);
