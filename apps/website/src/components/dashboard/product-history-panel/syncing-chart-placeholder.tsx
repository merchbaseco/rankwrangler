export const ChartSkeleton = ({ variant }: { variant: 'header' | 'chart' }) => {
    if (variant === 'header') {
        return (
            <>
                <div className="h-7 w-24 animate-pulse rounded bg-muted" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            </>
        );
    }
    return <div className="h-[180px] animate-pulse rounded bg-muted" />;
};
