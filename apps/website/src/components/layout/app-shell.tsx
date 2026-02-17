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
                <aside className="panel-dark flex w-full shrink-0 flex-col overflow-hidden rounded-2xl p-6 lg:w-[30%] lg:min-w-[320px] lg:max-w-[420px] lg:p-7">
                    <div className="panel-dark-decor" />

                    {/* Top: Brand + avatar */}
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight lg:text-6xl">
                                Rank
                                <br />
                                Wrangler
                            </h1>
                            <p className="mt-4 font-mono text-xs uppercase tracking-[0.15em] text-[#A89880]">
                                Amazon BSR Intelligence
                            </p>
                        </div>
                        <UserButton
                            appearance={{
                                elements: {
                                    avatarBox: 'w-8 h-8',
                                },
                            }}
                        />
                    </div>

                    {/* Spacer pushes content to bottom */}
                    <div className="flex-1" />

                    {/* Bottom: stats + license */}
                    <div className="relative z-10">
                        {sidebar}
                    </div>
                </aside>

                {/* Right content area */}
                <main className="flex min-h-0 flex-1 flex-col">
                    {children}
                </main>
            </div>
        </div>
    );
}
