import { AppLayout } from '@heroui-pro/react';
import { useCallback, useState } from 'react';
import { RouterProvider } from 'react-aria-components';
import { Outlet, useHref, useNavigate } from 'react-router-dom';
import { SettingsModal } from '@/features/settings/settings-modal';
import type { SettingsPage } from '@/features/settings/settings-navigation';
import { AppBanner } from './app-banner';
import { PageToolbarProvider } from './page-toolbar';
import { usePrefetchViews } from './use-prefetch-views';
import { useViewShortcuts } from './use-view-shortcuts';

/**
 * The app frame (Grid J/K): Pro AppLayout with no sidebar, the dark banner on
 * top and the routed screen inside one rounded content surface inset from the
 * window edges (`.app-frame` and `.app-surface` in the theme). React Aria's
 * RouterProvider sends every HeroUI link (view tabs, menu items) through
 * react-router instead of a page load.
 */
export const AppShell = () => {
    const navigate = useNavigate();
    useViewShortcuts();
    usePrefetchViews();
    const [settings, setSettings] = useState<SettingsRequest | null>(null);

    const openSettings = useCallback((page: SettingsPage) => {
        setSettings(current => ({ page, request: (current?.request ?? 0) + 1 }));
    }, []);
    const handleSettingsOpenChange = useCallback((open: boolean) => {
        if (!open) {
            setSettings(current => (current ? { ...current, page: null } : null));
        }
    }, []);

    return (
        <RouterProvider navigate={navigate} useHref={useHref}>
            <PageToolbarProvider>
                <AppLayout
                    className="app-frame"
                    navbar={<AppBanner onOpenSettings={openSettings} />}
                    scrollMode="content"
                >
                    <div className="app-surface">
                        <Outlet />
                    </div>
                </AppLayout>
            </PageToolbarProvider>
            <SettingsModal
                initialPage={settings?.page ?? 'general'}
                key={settings?.request ?? 0}
                onOpenChange={handleSettingsOpenChange}
                open={Boolean(settings?.page)}
            />
        </RouterProvider>
    );
};

interface SettingsRequest {
    readonly page: SettingsPage | null;
    /** Bumped per open so the modal remounts on the requested page. */
    readonly request: number;
}
