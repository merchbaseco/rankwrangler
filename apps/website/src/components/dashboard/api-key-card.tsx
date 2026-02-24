import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import { useLicense } from "@/hooks/use-license";

const maskKey = (value: string) => {
    if (value.length <= 10) {
        return "\u2022".repeat(value.length);
    }
    return `${value.slice(0, 7)}${"\u2022".repeat(10)}${value.slice(-4)}`;
};

export const ApiKeyCard = () => {
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
        if (!license?.key) {
            return "";
        }
        return revealed ? license.key : maskKey(license.key);
    }, [license?.key, revealed]);

    const showAccessError = errorCode === "FORBIDDEN";
    const showAuthError = errorCode === "UNAUTHORIZED";
    const showNotFound = errorCode === "NOT_FOUND";
    const showMissingKey =
        hasEmail && !license && !isLoading && !showAccessError && !showAuthError;
    const showError = error && !showAccessError && !showAuthError && !showNotFound;

    return (
        <div>
            <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
                <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        API Key
                    </p>
                    {license ? <span className="size-1.5 rounded-full bg-success" /> : null}
                </div>
            </div>
            <div className="px-3 py-3">
                {isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                ) : null}
                {showAccessError ? (
                    <p className="text-xs text-warning-foreground">
                        Admin access required. Update ADMIN_EMAIL.
                    </p>
                ) : null}
                {showAuthError ? (
                    <p className="text-xs text-warning-foreground">
                        Session expired. Please sign out and back in.
                    </p>
                ) : null}
                {showMissingKey ? (
                    <p className="text-xs text-muted-foreground">
                        No API key yet. Generate one below.
                    </p>
                ) : null}

                {license ? (
                    <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-2 py-1.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                            {keyValue}
                        </code>
                        <button
                            type="button"
                            onClick={() => setRevealed((current) => !current)}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={revealed ? "Hide API key" : "Show API key"}
                        >
                            {revealed ? (
                                <EyeOff className="size-3.5" />
                            ) : (
                                <Eye className="size-3.5" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => license?.key && copy(license.key)}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Copy API key"
                        >
                            {copied ? (
                                <Check className="size-3.5 text-success" />
                            ) : (
                                <Copy className="size-3.5" />
                            )}
                        </button>
                    </div>
                ) : null}

                {showError ? (
                    <p className="text-xs text-destructive">{error.message}</p>
                ) : null}

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 w-full rounded-sm text-xs"
                    onClick={() => regenerate()}
                    disabled={isRegenerating || showAccessError || !hasEmail}
                >
                    <RefreshCw className={isRegenerating ? "size-3 animate-spin" : "size-3"} />
                    {license ? "Rotate Key" : "Generate Key"}
                </Button>
            </div>
        </div>
    );
};
