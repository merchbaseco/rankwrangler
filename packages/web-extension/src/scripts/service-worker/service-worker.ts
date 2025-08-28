import type { BackgroundMessage } from '../content/types';
import { ProductInfoHandler } from './handlers/productInfo';
import { StatsHandler } from './handlers/stats';
import { LicenseHandler } from './handlers/license';

console.log('RankWrangler Background Service Worker Loaded');

// Initialize handlers
const productInfoHandler = ProductInfoHandler.getInstance();
const statsHandler = StatsHandler.getInstance();
const licenseHandler = LicenseHandler.getInstance();

chrome.runtime.onInstalled.addListener(() => {
    console.log('RankWrangler extension installed');
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
    console.log('Background received message:', message);

    switch (message.type) {
        case 'ping':
            sendResponse({ alive: true });
            return true;

        case 'background-ping':
            sendResponse({ alive: true });
            return true;

        case 'getStats':
            statsHandler.handleGetStats(sendResponse);
            return true;

        case 'resetStats':
            statsHandler.handleResetStats(sendResponse);
            return true;

        case 'updateQueue':
            statsHandler.handleUpdateQueue(message, sendResponse);
            return true;

        case 'fetchProductInfo':
            productInfoHandler.handleFetchProductInfo(message, sendResponse);
            return true;

        case 'validateLicense':
            licenseHandler.handleValidateLicense(message, sendResponse);
            return true;

        case 'setLicense':
            licenseHandler.handleSetLicense(message, sendResponse);
            return true;

        case 'removeLicense':
            licenseHandler.handleRemoveLicense(message, sendResponse);
            return true;

        case 'getLicenseStatus':
            licenseHandler.handleGetLicenseStatus(message, sendResponse);
            return true;

        default:
            console.warn('Unknown message type:', message);
            return false;
    }
});
