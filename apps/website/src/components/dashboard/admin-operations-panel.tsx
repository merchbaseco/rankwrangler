import { api } from "@/lib/trpc";
import { formatNumber, cn } from "@/lib/utils";

const COLS = 3;

export const AdminOperationsPanel = () => {
    const { data, isLoading } = api.api.app.getAdminStats.useQuery(undefined, {
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
    });

    const stats = data?.stats ?? [];
    const rows = Math.ceil(stats.length / COLS);

    return (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
            {isLoading ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                    Loading stats...
                </p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3">
                    {stats.map((stat, i) => {
                        const col = i % COLS;
                        const row = Math.floor(i / COLS);
                        const isLastCol = col === COLS - 1;
                        const isLastRow = row === rows - 1;

                        return (
                            <div
                                key={stat.label}
                                className={cn(
                                    "flex flex-col justify-between p-3",
                                    !isLastCol && "border-r border-border",
                                    !isLastRow && "border-b border-border",
                                )}
                            >
                                <div>
                                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                                        {stat.label}
                                    </p>
                                    <p className="font-display mt-0.5 text-xl font-semibold text-foreground tabular-nums">
                                        {formatNumber(stat.total)}
                                    </p>
                                </div>
                                <Sparkline buckets={stat.buckets} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const VB_W = 200;
const VB_H = 40;

const Sparkline = ({ buckets }: { buckets: number[] }) => {
    if (buckets.length === 0) return null;

    const max = Math.max(...buckets, 1);
    const stepX = VB_W / (buckets.length - 1 || 1);

    const points = buckets.map((v, i) => ({
        x: i * stepX,
        y: VB_H - (v / max) * VB_H * 0.85 - VB_H * 0.05,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const areaPath = `${linePath} L${VB_W},${VB_H} L0,${VB_H} Z`;

    return (
        <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="mt-2 h-8 w-full"
            preserveAspectRatio="none"
        >
            <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#sparkFill)" />
            <path
                d={linePath}
                fill="none"
                stroke="var(--color-foreground)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
            />
        </svg>
    );
};
