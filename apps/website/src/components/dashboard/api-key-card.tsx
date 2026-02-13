import { useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw, Check } from 'lucide-react';
import { useCopy } from '@/hooks/use-copy';
import { useLicense } from '@/hooks/use-license';

const maskKey = (value: string) => {
    if (value.length <= 10) return '\u2022'.repeat(value.length);
    return `${value.slice(0, 7)}${'·'.repeat(10)}${value.slice(-4)}`;
};

export function ApiKeyCard() {
    const [revealed, setRevealed] = useState(false);
    const { copy, copied } = useCopy();
    const {
        license,
        hasEmail,
        isLoading,
        errorCode,
        error,
        regenerate,
        isRegenerating,
    } = useLicense();

    const keyValue = useMemo(() => {
        if (!license?.key) return '';
        return revealed ? license.key : maskKey(license.key);
    }, [license?.key, revealed]);

    const showAccessError = errorCode === 'FORBIDDEN';
    const showAuthError = errorCode === 'UNAUTHORIZED';
    const showNotFound = errorCode === 'NOT_FOUND';
    const showMissingKey =
        hasEmail && !license && !isLoading && !showAccessError && !showAuthError;
    const showError = error && !showAccessError && !showAuthError && !showNotFound;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#A89880]">
                    API Key
                </span>
                {license && (
                    <span className="inline-block size-2 rounded-full bg-[#34D399]" />
                )}
            </div>

            {isLoading && (
                <p className="text-sm text-[#A89880]">Loading...</p>
            )}

            {showAccessError && (
                <p className="text-sm text-[#FBBF24]">
                    Admin access required. Update ADMIN_EMAIL.
                </p>
            )}

            {showAuthError && (
                <p className="text-sm text-[#FBBF24]">
                    Session expired. Please sign out and back in.
                </p>
            )}

            {showMissingKey && (
                <p className="text-sm text-[#A89880]">
                    No API key yet. Generate one below.
                </p>
            )}

            {license && (
                <div className="flex items-center gap-2.5 rounded-xl bg-[rgba(245,240,235,0.06)] px-4 py-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-sm text-[#F5F0EB]/80">
                        {keyValue}
                    </code>
                    <button
                        type="button"
                        onClick={() => setRevealed(v => !v)}
                        className="shrink-0 text-[#A89880] transition-colors hover:text-[#F5F0EB]"
                        aria-label={revealed ? 'Hide' : 'Show'}
                    >
                        {revealed ? (
                            <EyeOff className="size-4" />
                        ) : (
                            <Eye className="size-4" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => license?.key && copy(license.key)}
                        className="shrink-0 text-[#A89880] transition-colors hover:text-[#F5F0EB]"
                        aria-label="Copy"
                    >
                        {copied ? (
                            <Check className="size-4 text-[#34D399]" />
                        ) : (
                            <Copy className="size-4" />
                        )}
                    </button>
                </div>
            )}

            {showError && (
                <p className="text-sm text-[#FCA5A5]">{error.message}</p>
            )}

            <button
                type="button"
                onClick={() => regenerate()}
                disabled={isRegenerating || showAccessError || !hasEmail}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[rgba(245,240,235,0.1)] px-4 py-2.5 text-sm text-[#F5F0EB] transition-colors hover:bg-[rgba(245,240,235,0.06)] disabled:opacity-40"
            >
                <RefreshCw className="size-3.5" />
                {license ? 'Rotate Key' : 'Generate Key'}
            </button>
        </div>
    );
}
