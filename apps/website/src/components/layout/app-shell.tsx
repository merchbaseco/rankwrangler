import { UserButton } from '@clerk/clerk-react';

interface AppShellProps {
    sidebar: React.ReactNode;
    children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
    return (
        <div className="h-screen overflow-hidden bg-background p-1.5 lg:p-2">
            <div className="flex h-[calc(100vh-12px)] flex-col gap-1.5 lg:h-[calc(100vh-16px)] lg:flex-row lg:gap-2">
                {/* Left dark panel — ~30%, no scroll */}
                <aside className="panel-dark flex w-full shrink-0 flex-col justify-between overflow-hidden rounded-3xl p-8 lg:w-[30%] lg:min-w-[320px] lg:max-w-[420px] lg:p-10">
                    <div className="panel-dark-decor" />

                    <div className="relative z-10 min-h-0 flex-1">
                        {/* Brand */}
                        <div className="mb-12">
                            <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight lg:text-6xl">
                                Rank
                                <br />
                                Wrangler
                            </h1>
                            <p className="mt-4 font-mono text-xs uppercase tracking-[0.15em] text-[#A89880]">
                                Amazon BSR Intelligence
                            </p>
                        </div>

                        {sidebar}
                    </div>

                    {/* Bottom user section */}
                    <div className="relative z-10 shrink-0 flex items-center gap-3 border-t border-[rgba(245,240,235,0.08)] pt-6">
                        <UserButton
                            appearance={{
                                elements: {
                                    avatarBox: 'w-9 h-9',
                                },
                            }}
                        />
                        <span className="text-sm text-[#A89880]">Account</span>
                    </div>
                </aside>

                {/* Right content area */}
                <main className="min-h-0 flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
