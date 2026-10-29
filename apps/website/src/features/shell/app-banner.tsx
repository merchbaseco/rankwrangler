import { Button, Tooltip } from '@heroui/react';
import { Navbar } from '@heroui-pro/react';
import { Bookmark02Icon, Settings01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui/icon';
import type { SettingsPage } from '@/features/settings/settings-navigation';
import { AccountMenu } from './account-menu';
import { BannerStatus } from './banner-status';
import { PageToolbarSlot } from './page-toolbar';
import { ThemeToggle } from './theme-toggle';
import { ViewTabs } from './view-tabs';
import { resolveSelectedView, views } from './view-tabs-model';

/**
 * The full-width banner on every route (Grid J/K, Handmade-style): the hat,
 * the view tabs, the page's ⌘K search (portalled in through PageToolbarSlot),
 * then the sync status, saved (not built), theme, settings and account. It is
 * the graphite scheme in both themes: the `dark` class re-points every HeroUI
 * token inside it (palette.css), and `.app-banner` sets its near-black ground.
 * On a phone the view tabs move into the stock Navbar menu.
 */
export const AppBanner = ({ onOpenSettings }: { onOpenSettings: (page: SettingsPage) => void }) => {
    const { pathname } = useLocation();
    const current = resolveSelectedView(pathname);
    return (
        <Navbar className="dark app-banner" height="3.375rem" maxWidth="full">
            <Navbar.Header>
                <Navbar.MenuToggle className="md:hidden" srLabel="Views" />
                <Navbar.Brand>
                    {/* The hat alone is the mark; it names the product and leads home. */}
                    <Link className="flex items-center" to="/explore">
                        <img alt="RankWrangler" height={26} src="/cowboy-hat.png" width={26} />
                    </Link>
                </Navbar.Brand>
                <ViewTabs />
                <PageToolbarSlot />
                <Navbar.Spacer />
                <Navbar.Content>
                    <BannerStatus />
                    <Tooltip>
                        {/* A disabled button takes no pointer, so the span carries the tooltip. */}
                        <Tooltip.Trigger<'span'>
                            render={props => <span {...props} className="max-md:hidden" />}
                        >
                            <Button
                                aria-label="Saved designs (coming soon)"
                                isDisabled
                                isIconOnly
                                size="sm"
                                variant="ghost"
                            >
                                <Icon icon={Bookmark02Icon} />
                            </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="bottom">
                            Saved designs · Coming soon
                        </Tooltip.Content>
                    </Tooltip>
                    <ThemeToggle />
                    <Tooltip>
                        <Button
                            aria-label="Settings"
                            className="max-md:hidden"
                            isIconOnly
                            onPress={() => onOpenSettings('general')}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon icon={Settings01Icon} />
                        </Button>
                        <Tooltip.Content placement="bottom">Settings</Tooltip.Content>
                    </Tooltip>
                    <AccountMenu onOpenSettings={onOpenSettings} />
                </Navbar.Content>
            </Navbar.Header>
            <Navbar.Menu>
                {views.map(view =>
                    view.href ? (
                        <Navbar.MenuItem
                            href={view.href}
                            isCurrent={current === view.id}
                            key={view.id}
                        >
                            {view.label}
                        </Navbar.MenuItem>
                    ) : null
                )}
                <Navbar.MenuItem href="/logs" isCurrent={pathname.startsWith('/logs')}>
                    Logs
                </Navbar.MenuItem>
            </Navbar.Menu>
        </Navbar>
    );
};
