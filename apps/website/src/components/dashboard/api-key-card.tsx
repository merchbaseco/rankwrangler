import { useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCopy } from '@/hooks/use-copy';
import { useLicense } from '@/hooks/use-license';

const maskKey = (value: string) => {
    if (value.length <= 10) return '•'.repeat(value.length);
    return `${value.slice(0, 7)}••••••••••${value.slice(-4)}`;
};

export function ApiKeyCard() {
    const [revealed, setRevealed] = useState(false);
    const { copy } = useCopy();
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
        <Card>
            <CardHeader>
                <div className="space-y-1">
                    <CardTitle>API Key</CardTitle>
                    <CardDescription>
                        Use this key to authenticate requests to the RankWrangler API.
                    </CardDescription>
                </div>
                {license && <Badge>Active</Badge>}
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {isLoading && (
                        <Alert>
                            <AlertTitle>Loading</AlertTitle>
                            <AlertDescription>Fetching your API key.</AlertDescription>
                        </Alert>
                    )}

                    {showAccessError && (
                        <Alert variant="warning">
                            <AlertTitle>Admin access required</AlertTitle>
                            <AlertDescription>
                                Update `ADMIN_EMAIL` in the server environment to grant access.
                            </AlertDescription>
                        </Alert>
                    )}

                    {showAuthError && (
                        <Alert variant="warning">
                            <AlertTitle>Session expired</AlertTitle>
                            <AlertDescription>
                                Please sign out and back in to continue.
                            </AlertDescription>
                        </Alert>
                    )}

                    {showMissingKey && (
                        <Alert>
                            <AlertTitle>No API key</AlertTitle>
                            <AlertDescription>
                                Generate a new key to start making requests.
                            </AlertDescription>
                        </Alert>
                    )}

                    {license && (
                        <div className="space-y-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <Input readOnly value={keyValue} aria-label="API key" />
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setRevealed(value => !value)}
                                        aria-label={revealed ? 'Hide API key' : 'Show API key'}
                                    >
                                        {revealed ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => license?.key && copy(license.key)}
                                        aria-label="Copy API key"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <CardDescription>
                                Keep this key private. You can rotate it at any time.
                            </CardDescription>
                        </div>
                    )}

                    {showError && (
                        <Alert variant="error">
                            <AlertTitle>Something went wrong</AlertTitle>
                            <AlertDescription>{error.message}</AlertDescription>
                        </Alert>
                    )}
                </div>
            </CardContent>
            <CardFooter>
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <CardDescription>
                        Rotating keys will create a new token and leave existing keys active.
                    </CardDescription>
                    <Button
                        onClick={() => regenerate()}
                        disabled={isRegenerating || showAccessError || !hasEmail}
                    >
                        <RefreshCw className="h-4 w-4" />
                        {license ? 'Regenerate' : 'Generate'}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
