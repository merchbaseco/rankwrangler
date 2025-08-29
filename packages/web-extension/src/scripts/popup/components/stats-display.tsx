import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Database01Icon,
    Loading03Icon
} from 'hugeicons-react';
import { useStats } from '../hooks/useStats';

interface StatCardProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    colorClass: string;
}

const StatCard = ({ icon: Icon, label, value, colorClass }: StatCardProps) => (
    <Card className="relative overflow-hidden">
        <CardContent className="p-3">
            <div className="flex items-center space-x-2">
                <div className="flex-shrink-0">
                    <div className={`w-8 h-8 bg-gradient-to-r ${colorClass} rounded-lg flex items-center justify-center`}>
                        <Icon className="w-4 h-4" />
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{label}</p>
                    <p className="text-lg font-semibold text-foreground">{value}</p>
                </div>
            </div>
        </CardContent>
    </Card>
);

const StatsDisplay = () => {
    const { data: stats, isLoading, refetch } = useStats();


    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Extension Stats</span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    className="text-xs text-muted-foreground hover:text-foreground h-auto p-1"
                >
                    Refresh
                </Button>
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
                    <StatCard
                        icon={(props) => <Database01Icon {...props} className="text-blue-600" />}
                        label="Cached Products"
                        value={stats?.cacheSuccessCount ?? 0}
                        colorClass="from-blue-500/20 to-blue-500/10"
                    />
                    <StatCard
                        icon={(props) => <Loading03Icon {...props} className="text-orange-600" />}
                        label="Active Queue"
                        value={stats?.queueCount ?? 0}
                        colorClass="from-orange-500/20 to-orange-500/10"
                    />
                </div>
            )}
        </div>
    );
};

export default StatsDisplay;