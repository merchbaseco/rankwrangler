import { log } from '../../utils/logger';
import type { BackgroundMessage } from '../content/types';
import { handleFetchProductInfo } from './handlers/fetch-product-info';
import { handleGetLicenseStatus } from './handlers/get-license-status';
import { handlePing } from './handlers/ping';
import { handleRemoveLicense } from './handlers/remove-license';
import { handleSetLicense } from './handlers/set-license';
import { handleValidateLicense } from './handlers/validate-license';

log.ready('Background Service Worker Loaded');

chrome.runtime.onInstalled.addListener(() => {
    log.success('Extension installed');
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
    log.debug('Received message:', message);

    switch (message.type) {
        case 'ping':
            handlePing(message, sendResponse);
            return true;

        case 'fetchProductInfo':
            handleFetchProductInfo(message, sendResponse);
            return true;

        case 'validateLicense':
            handleValidateLicense(message, sendResponse);
            return true;

        case 'setLicense':
            handleSetLicense(message, sendResponse);
            return true;

        case 'removeLicense':
            handleRemoveLicense(message, sendResponse);
            return true;

        case 'getLicenseStatus':
            handleGetLicenseStatus(message, sendResponse);
            return true;

        default:
            log.warn('Unknown message type:', message);
            return false;
    }
});
