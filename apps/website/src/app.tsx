import { useEffect, useState } from 'react';
import { LayoutDashboard, Shield } from 'lucide-react';
import { AdminOperationsPanel } from '@/components/dashboard/admin-operations-panel';
import { ApiKeyCard } from '@/components/dashboard/api-key-card';
import { RecentProducts } from '@/components/dashboard/recent-products';
import { SearchBar } from '@/components/dashboard/search-bar';
import { UsageCard } from '@/components/dashboard/usage-card';
import { AppShell } from '@/components/layout/app-shell';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { cn } from '@/lib/utils';

type DashboardView = 'main' | 'admin';

export function App() {
    const [view, setView] = useState<DashboardView>('main');
    const { isAdmin } = useAdminAccess();

    useEffect(() => {
        if (!isAdmin && view === 'admin') {
            setView('main');
        }
    }, [isAdmin, view]);

    return (
        <AppShell
            sidebar={
                <div className="space-y-6">
                    <UsageCard />
                    <div className="h-px bg-[rgba(245,240,235,0.08)]" />
                    <ApiKeyCard />
                </div>
            }
            sidebarHeaderActions={
                isAdmin ? (
                    <button
                        type="button"
                        onClick={() => {
                            setView(current => (current === 'main' ? 'admin' : 'main'));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(245,240,235,0.22)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#E9DFD4] transition-colors hover:bg-[rgba(245,240,235,0.12)]"
                        aria-label={
                            view === 'admin'
                                ? 'Return to main dashboard view'
                                : 'Open admin runtime view'
                        }
                        title={
                            view === 'admin'
                                ? 'Return to main dashboard'
                                : 'Open admin runtime panel'
                        }
                    >
                        {view === 'admin' ? (
                            <LayoutDashboard className="size-3.5" />
                        ) : (
                            <Shield className="size-3.5" />
                        )}
                        {view === 'admin' ? 'Main' : 'Admin'}
                    </button>
                ) : null
            }
        >
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div
                    className={cn(
                        'absolute inset-0 flex min-h-0 flex-col transition-all duration-300',
                        view === 'main'
                            ? 'translate-x-0 opacity-100'
                            : '-translate-x-8 opacity-0 pointer-events-none'
                    )}
                >
                    <div className="shrink-0">
                        <SearchBar />
                    </div>
                    <div className="mt-3 min-h-0 flex-1">
                        <RecentProducts />
                    </div>
                </div>

                <div
                    className={cn(
                        'absolute inset-0 flex min-h-0 flex-col transition-all duration-300',
                        view === 'admin'
                            ? 'translate-x-0 opacity-100'
                            : 'translate-x-8 opacity-0 pointer-events-none'
                    )}
                >
                    {isAdmin ? <AdminOperationsPanel /> : null}
                </div>
            </div>
        </AppShell>
    );
}
