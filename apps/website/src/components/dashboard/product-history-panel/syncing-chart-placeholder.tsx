import { Loader2 } from 'lucide-react';
import {
	buildSyncWavePath,
	SYNC_INNER_H,
	SYNC_PAD,
	SYNC_VB_H,
	SYNC_VB_W,
} from '@/components/dashboard/product-history-panel/chart-utils';

const SYNC_WAVE_PATH = buildSyncWavePath();

export const ChartSkeleton = () => (
    <div className="space-y-2">
        <div className="h-7 w-24 animate-pulse bg-muted" />
        <div className="h-3 w-36 animate-pulse bg-muted" />
        <div className="h-[160px] animate-pulse bg-muted" />
    </div>
);

export const SyncingChartPlaceholder = ({ color, gradientId }: { color: string; gradientId: string }) => {
	const shimmerGradientId = `sync-shimmer-${gradientId}`;
	const areaGradientId = `sync-area-${gradientId}`;

    return (
        <div className="space-y-2">
            <div className="space-y-1">
                <div className="relative h-7 w-20 overflow-hidden bg-muted/60">
                    <div
                        className="absolute inset-0"
                        style={{
                            background:
                                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                            animation:
                                'sync-shimmer 1.8s ease-in-out infinite',
                        }}
                    />
                </div>
                <div className="relative h-3.5 w-32 overflow-hidden bg-muted/40">
                    <div
                        className="absolute inset-0"
                        style={{
                            background:
                                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                            animation:
                                'sync-shimmer 1.8s ease-in-out infinite 0.15s',
                        }}
                    />
                </div>
            </div>

            <div className="relative overflow-hidden border border-border">
                <svg
                    viewBox={`0 0 ${SYNC_VB_W} ${SYNC_VB_H}`}
                    className="block w-full"
                    style={{
                        aspectRatio: `${SYNC_VB_W}/${SYNC_VB_H}`,
                    }}
                >
                    <defs>
                        <linearGradient
                            id={areaGradientId}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor={color}
                                stopOpacity="0.08"
                            />
                            <stop
                                offset="100%"
                                stopColor={color}
                                stopOpacity="0"
                            />
                        </linearGradient>
                        <linearGradient
                            id={shimmerGradientId}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                        >
                            <stop
                                offset="0%"
                                stopColor={color}
                                stopOpacity="0.06"
                            />
                            <stop
                                offset="40%"
                                stopColor={color}
                                stopOpacity="0.18"
                            />
                            <stop
                                offset="50%"
                                stopColor={color}
                                stopOpacity="0.25"
                            />
                            <stop
                                offset="60%"
                                stopColor={color}
                                stopOpacity="0.18"
                            />
                            <stop
                                offset="100%"
                                stopColor={color}
                                stopOpacity="0.06"
                            />
                        </linearGradient>
                    </defs>
                    {[0.25, 0.5, 0.75].map((fraction) => (
                        <line
                            key={fraction}
                            x1={SYNC_PAD.l}
                            x2={SYNC_VB_W - SYNC_PAD.r}
                            y1={SYNC_PAD.t + fraction * SYNC_INNER_H}
                            y2={SYNC_PAD.t + fraction * SYNC_INNER_H}
                            stroke="var(--color-border)"
                            strokeWidth="0.5"
                            opacity="0.5"
                        />
                    ))}
                    <path
                        d={`${SYNC_WAVE_PATH} L ${SYNC_VB_W - SYNC_PAD.r} ${SYNC_VB_H - SYNC_PAD.b} L ${SYNC_PAD.l} ${SYNC_VB_H - SYNC_PAD.b} Z`}
                        fill={`url(#${areaGradientId})`}
                        style={{
                            animation:
                                'sync-area-pulse 2.5s ease-in-out infinite',
                        }}
                    />
                    <path
                        d={SYNC_WAVE_PATH}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.3"
                        strokeDasharray="1200"
                        strokeDashoffset="0"
                        style={{
                            animation:
                                'sync-line-draw 2.5s ease-in-out infinite',
                        }}
                    />
                    <rect
                        x={-100}
                        y={0}
                        width={100}
                        height={SYNC_VB_H}
                        fill={`url(#${shimmerGradientId})`}
                        style={{
                            animation:
                                'sync-sweep 2.5s ease-in-out infinite',
                        }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-2 bg-background/80 px-3 py-1.5 ring-1 ring-border/50 backdrop-blur-sm">
                        <Loader2
                            className="size-3 animate-spin"
                            style={{ color }}
                        />
                        <span className="font-mono text-[11px] font-medium text-muted-foreground">
                            Fetching from Keepa&hellip;
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
