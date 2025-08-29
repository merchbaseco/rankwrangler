import { Database01Icon, HierarchySquare03Icon, Loading03Icon } from 'hugeicons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useReactRootsCount } from '../hooks/useReactRootsCount';
import { useStats } from '../hooks/useStats';

interface StatCardProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    colorClass: string;
}

const StatRow = ({ icon: Icon, label, value, colorClass }: StatCardProps) => (
    <div className="flex items-center justify-between py-2 px-2 border-b last:border-b-0">
        <div className="flex items-center gap-3">
            <div
                className={`size-6 bg-gradient-to-r ${colorClass} rounded-sm flex items-center justify-center flex-shrink-0`}
            >
                <Icon className="size-4" />
            </div>
            <span className="text-sm text-foreground">{label}</span>
        </div>
        <span className="text-lg font-bold text-foreground">{value}</span>
    </div>
);

const StatsDisplay = () => {
    const { data: stats, isLoading, refetch } = useStats();
    const { data: reactRootsCount } = useReactRootsCount();

    return (
        <div className="flex flex-col gap-3">
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
                            <span className="ml-2 text-sm text-muted-foreground">
                                Loading stats...
                            </span>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <StatRow
                            icon={props => (
                                <Database01Icon
                                    {...props}
                                    className={cn(props.className, 'text-blue-600')}
                                />
                            )}
                            label="Local Cache"
                            value={stats?.localCacheCount ?? 0}
                            colorClass="from-blue-500/20 to-blue-500/10"
                        />
                        <StatRow
                            icon={props => (
                                <Loading03Icon
                                    {...props}
                                    className={cn(props.className, 'text-orange-600')}
                                />
                            )}
                            label="Active Queue"
                            value={stats?.queueCount ?? 0}
                            colorClass="from-orange-500/20 to-orange-500/10"
                        />
                        <StatRow
                            icon={props => (
                                <HierarchySquare03Icon
                                    {...props}
                                    className={cn(props.className, 'text-purple-600')}
                                />
                            )}
                            label="React Roots"
                            value={reactRootsCount ?? 0}
                            colorClass="from-purple-500/20 to-purple-500/10"
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default StatsDisplay;
