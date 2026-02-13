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
                <div className="space-y-8">
                    <ApiKeyCard />
                    <div className="h-px bg-border" />
                    <UsageCard />
                </div>
            }
        >
            <div className="space-y-6">
                <SearchBar />
                <RecentProducts />
            </div>
        </AppShell>
    );
}
