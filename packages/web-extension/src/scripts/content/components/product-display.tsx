import { useState } from 'react';
import type { Product } from '@/scripts/types/product';
import { log } from '../../../utils/logger';
import { PortalTooltip } from './portal-tooltip';

/**
 * Product display component showing rank, category, date, and ASIN
 *
 * Includes copy-to-clipboard functionality for ASIN
 */
export function ProductDisplay({
    product,
    isLoading = false,
    isError = false,
}: {
    product: Product;
    isLoading?: boolean;
    isError?: boolean;
}) {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
    const [showTooltip, setShowTooltip] = useState(false);

    const handleCopyAsin = async () => {
        if (copyStatus !== 'idle') return;

        setCopyStatus('copying');

        try {
            await navigator.clipboard.writeText(asin);
            setCopyStatus('copied');

            setTimeout(() => {
                setCopyStatus('idle');
            }, 1500);
        } catch (error) {
            log.error('Failed to copy ASIN:', error);
            setCopyStatus('idle');
        }
    };

    if (isError) {
        return (
            <div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 z-[1]">
                <span className="text-red-600 text-sm font-medium">Unable to fetch rank</span>
            </div>
        );
    }

    if (isLoading || !product) {
        return (
            <div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm flex flex-col gap-1.5">
                {/* Skeleton for BSR rank and category */}
                <div className="flex items-baseline gap-0.5">
                    <span className="text-base font-semibold text-transparent bg-gray-200 rounded animate-pulse">
                        #99,999
                    </span>
                    <span className="text-xs text-transparent bg-gray-200 rounded ml-1 animate-pulse">
                        in Example Category
                    </span>
                </div>
                
                {/* Skeleton for metadata row */}
                <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-200 w-full">
                    <span className="text-xs text-transparent bg-gray-200 rounded flex-1 animate-pulse">
                        December 31, 2024
                    </span>
                    <span className="text-xs text-transparent bg-gray-200 rounded px-1.5 py-0.5 animate-pulse">
                        B0EXAMPLE1
                    </span>
                </div>
            </div>
        );
    }

    const { asin, bsr, bsrCategory, classificationRanks, creationDate } = product;

    if (!bsr || !bsrCategory) {
        return (
            <div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 z-[1]">
                <span className="text-gray-800 text-sm font-medium">No rank data</span>
            </div>
        );
    }

    return (
        <div className="w-full bg-gradient-to-r from-white/[0.98] to-white/[0.95] backdrop-blur border border-gray-200 rounded-lg px-3 py-2 shadow-sm animate-in fade-in duration-300 z-[1] flex flex-col gap-1.5">
            {/* BSR Rank and Category - matches .rw-success */}
            {classificationRanks.length > 0 ? (
                <PortalTooltip
                    show={showTooltip}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    content={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <p
                                style={{
                                    fontWeight: '500',
                                    fontSize: '12px',
                                    color: 'rgb(31, 41, 55)',
                                    marginBottom: '4px',
                                }}
                            >
                                Also ranked:
                            </p>
                            {classificationRanks.map(ranking => (
                                <div
                                    key={`${ranking.category}-${ranking.rank}`}
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgb(55, 65, 81)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: '4px',
                                            height: '4px',
                                            backgroundColor: 'rgb(156, 163, 175)',
                                            borderRadius: '50%',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span className="line-clamp-1">
                                        #{ranking.rank.toLocaleString()} in {ranking.category}
                                    </span>
                                </div>
                            ))}
                        </div>
                    }
                >
                    <div className="text-green-700 flex items-baseline gap-0.5 cursor-pointer hover:text-green-800 transition-colors duration-200">
                        <span className="text-base font-semibold text-gray-800">
                            #{bsr.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-600 ml-1 line-clamp-1">
                            in {bsrCategory}
                        </span>
                    </div>
                </PortalTooltip>
            ) : (
                <div className="text-green-700 flex items-baseline gap-0.5">
                    <span className="text-base font-semibold text-gray-800">
                        #{bsr.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-600 ml-1 line-clamp-1">
                        in {bsrCategory}
                    </span>
                </div>
            )}

            {/* Metadata: Date and ASIN - matches .rw-meta */}
            <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-200 w-full">
                <span className="text-xs text-gray-600 flex-1">
                    {creationDate &&
                        new Date(creationDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        })}
                </span>

                <button
                    type="button"
                    onClick={handleCopyAsin}
                    className="text-xs text-gray-600 cursor-pointer px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 hover:text-gray-800 transition-all duration-200"
                    title="Click to copy ASIN"
                    disabled={copyStatus !== 'idle'}
                >
                    {copyStatus === 'copied' ? 'Copied!' : asin}
                </button>
            </div>
        </div>
    );
}
