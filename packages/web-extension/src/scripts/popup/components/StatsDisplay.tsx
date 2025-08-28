import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
    Database01Icon,
    Loading03Icon
} from 'hugeicons-react';
import type { Stats } from '../../content/types';

interface StatsData extends Stats {
    queueCount?: number;
}

const StatsDisplay = () => {
    const [stats, setStats] = useState<StatsData>({
        totalRequests: 0,
        liveSuccessCount: 0,
        cacheSuccessCount: 0,
        failureCount: 0,
        queueCount: 0
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        setIsLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({ type: 'getStats' });
            if (response && response.stats) {
                setStats({
                    ...response.stats,
                    queueCount: response.queueCount || 0
                });
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Extension Stats</span>
                <button
                    onClick={loadStats}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Refresh
                </button>
            </div>

            {isLoading ? (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            <span className="ml-2 text-sm text-muted-foreground">Loading stats...</span>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {/* Cached Products */}
                    <Card className="relative overflow-hidden">
                        <CardContent className="p-3">
                            <div className="flex items-center space-x-2">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500/20 to-blue-500/10 rounded-lg flex items-center justify-center">
                                        <Database01Icon className="w-4 h-4 text-blue-600" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground truncate">Cached Products</p>
                                    <p className="text-lg font-semibold text-foreground">{stats.cacheSuccessCount}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Active Queue */}
                    <Card className="relative overflow-hidden">
                        <CardContent className="p-3">
                            <div className="flex items-center space-x-2">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 bg-gradient-to-r from-orange-500/20 to-orange-500/10 rounded-lg flex items-center justify-center">
                                        <Loading03Icon className="w-4 h-4 text-orange-600" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground truncate">Active Queue</p>
                                    <p className="text-lg font-semibold text-foreground">{stats.queueCount || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default StatsDisplay;