import React, { useEffect, useState } from 'react';
import { ProductEnhancer } from './components/product-enhancer';

const App = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [pingResult, setPingResult] = useState<string>('');

    useEffect(() => {
        console.log('RankWrangler: Content script App.tsx loaded');
        console.log('RankWrangler: BSR enhancement active');

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('RankWrangler: Message Received', request, sender, sendResponse);
        });
    }, []);

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const testServiceWorker = async () => {
        console.log('[App] Testing service worker connection...');
        setPingResult('Testing...');

        try {
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'ping' }, response => {
                    if (chrome.runtime.lastError) {
                        resolve({ error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                });
            });

            console.log('[App] Service worker ping response:', response);
            setPingResult(JSON.stringify(response));
        } catch (error) {
            console.error('[App] Service worker ping error:', error);
            setPingResult(`Error: ${error}`);
        }
    };

    return (
        <>
            {/* BSR Enhancement Component */}
            {/*<ProductEnhancer />*/}

            {/* Floating Menu - Full Menu */}
            {isMenuOpen && (
                <div className="fixed bottom-4 right-4 z-[2147483647] animate-in fade-in duration-300">
                    <div className="bg-gradient-to-br from-red-200 via-red-400 to-red-600 rounded-lg p-4 shadow-lg min-w-[300px]">
                        <div className="flex flex-col gap-3">
                            <div className="text-white text-sm font-semibold">
                                🔥 RankWrangler Active - BSR injection enabled!!
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={testServiceWorker}
                                    className="px-3 py-1 bg-white text-gray-800 rounded text-sm font-medium hover:bg-gray-100 transition-colors"
                                >
                                    Test Service Worker
                                </button>
                                <button
                                    onClick={toggleMenu}
                                    className="px-3 py-1 bg-white text-gray-800 rounded text-sm font-medium hover:bg-gray-100 transition-colors"
                                >
                                    Hide
                                </button>
                            </div>

                            {pingResult && (
                                <div className="bg-white/20 rounded p-2 text-xs text-white font-mono break-all">
                                    <div className="font-semibold mb-1">
                                        Service Worker Response:
                                    </div>
                                    {pingResult}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Small Reopen Button - Only show when menu is closed */}
            {!isMenuOpen && (
                <button
                    onClick={toggleMenu}
                    className="fixed bottom-4 right-4 z-[2147483647] w-12 h-12 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform duration-200 animate-in fade-in"
                    title="Open RankWrangler Debug Menu"
                >
                    <span className="text-white text-lg font-bold">🔥</span>
                </button>
            )}
        </>
    );
};

export default App;
