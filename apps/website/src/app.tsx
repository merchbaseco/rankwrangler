import { AmazonMerchSearchCard } from '@/components/dashboard/amazon-merch-search-card';
import { ApiKeyCard } from '@/components/dashboard/api-key-card';
import { RecentProducts } from '@/components/dashboard/recent-products';
import { SearchBar } from '@/components/dashboard/search-bar';
import { UsageCard } from '@/components/dashboard/usage-card';
import { AppShell } from '@/components/layout/app-shell';

export function App() {
    return (
        <AppShell
            sidebar={
                <div className="space-y-6">
                    <UsageCard />
                    <div className="h-px bg-[rgba(245,240,235,0.08)]" />
                    <ApiKeyCard />
                </div>
            }
        >
            <div className="shrink-0">
                <SearchBar />
            </div>
            <div className="mt-3 min-h-0 flex-1">
                <RecentProducts />
            </div>
        </AppShell>
    );
}
