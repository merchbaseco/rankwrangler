import { ApiKeyCard } from '@/components/dashboard/api-key-card';
import { UsageCard } from '@/components/dashboard/usage-card';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export function App() {
    return (
        <AppShell>
            <section className="space-y-6">
                <div className="space-y-2">
                    <Badge>Dashboard</Badge>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold">API access and usage</h1>
                        <p className="text-muted-foreground">
                            Generate keys, track usage, and manage limits.
                        </p>
                    </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ApiKeyCard />
                    <UsageCard />
                </div>
            </section>
        </AppShell>
    );
}
