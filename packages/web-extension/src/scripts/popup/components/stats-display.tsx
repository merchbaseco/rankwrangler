import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const StatsDisplay = () => {
    const [debugMode, setDebugMode] = useState(false);

    useEffect(() => {
        // Load initial debug mode state
        chrome.storage.local.get(['debugMode'], (result) => {
            setDebugMode(result.debugMode || false);
        });
    }, []);

    const toggleDebugMode = async () => {
        const newDebugMode = !debugMode;
        setDebugMode(newDebugMode);
        
        // Save to storage
        await chrome.storage.local.set({ debugMode: newDebugMode });
        
        // Send message to service worker to relay to all content scripts
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'toggleDebugMode',
                debugMode: newDebugMode
            });
            console.log('Debug mode toggle response:', response);
        } catch (error) {
            console.error('Error sending debug mode toggle:', error);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Debug Mode</CardTitle>
                        <CardDescription className="text-xs">
                            Show extension stats on Amazon pages
                        </CardDescription>
                    </div>
                    <button
                        onClick={toggleDebugMode}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                            debugMode ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                debugMode ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </CardHeader>
            
            {debugMode && (
                <CardContent className="pt-0">
                    <div className="text-xs text-muted-foreground">
                        Debug widget visible on Amazon pages showing:
                        <ul className="mt-1 ml-2 space-y-1">
                            <li>• Cache count</li>
                            <li>• Active queue</li>
                            <li>• React roots</li>
                        </ul>
                    </div>
                </CardContent>
            )}
        </Card>
    );
};

export default StatsDisplay;
