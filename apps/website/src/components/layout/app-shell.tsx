import { UserButton, useUser } from '@clerk/clerk-react';
import { Badge } from '@/components/ui/badge';

export function AppShell({ children }: { children: React.ReactNode }) {
    const { user } = useUser();
    const email =
        user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;

    return (
        <div className="relative isolate min-h-screen bg-background">
            <div aria-hidden className="background-frame" />

            <div className="relative z-10">
                <header className="border-b border-border">
                    <div className="mx-auto max-w-background-frame-max p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xl font-semibold">RankWrangler</p>
                                <p className="text-sm text-muted-foreground">API Console</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {email && <Badge>{email}</Badge>}
                                <UserButton />
                            </div>
                        </div>
                    </div>
                </header>

                <main>
                    <div className="pb-24">
                        <div className="max-w-background-frame-max mx-auto px-4 mt-6">
                            {children}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
