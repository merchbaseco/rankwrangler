import { Settings01Icon } from 'hugeicons-react';
import { useEffect, useState } from 'react';
import { browser } from 'webextension-polyfill-ts';
import { Switch } from '@/components/ui/switch';

export const DebugToggle = () => {
    const [debugMode, setDebugMode] = useState(false);

    useEffect(() => {
        browser.storage.local.get(['debugMode']).then(result => {
            setDebugMode(result.debugMode || false);
        });
    }, []);

    const toggleDebugMode = (newDebugMode: boolean) => {
        setDebugMode(newDebugMode);
        browser.storage.local.set({ debugMode: newDebugMode });
        notifyContentScriptOfDebugState(newDebugMode);
    };

    const notifyContentScriptOfDebugState = async (debugMode: boolean) => {
        // Use dynamic script injection to directly update debug mode in content scripts.
        const tabs = await browser.tabs.query({
            url: ['https://www.amazon.com/*', 'https://amazon.com/*'],
        });

        for (const tab of tabs) {
            if (tab.id) {
                // Inject script directly to update storage and trigger change
                await browser.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: debugMode => {
                        // Update storage
                        chrome.storage.local.set({ debugMode });
                        console.log('Debug mode updated via script injection:', debugMode);

                        // Dispatch custom event for React app to detect immediately
                        window.dispatchEvent(
                            new CustomEvent('debugModeChanged', {
                                detail: { debugMode },
                            })
                        );
                    },
                    args: [debugMode],
                });
            }
        }
    };

    return (
        <div className="flex items-center w-full gap-1.5">
            <Settings01Icon className="size-5 text-primary" />
            <div className="text-sm font-medium">Debug Mode</div>
            <Switch checked={debugMode} onCheckedChange={toggleDebugMode} className="ml-auto" />
        </div>
    );
};
