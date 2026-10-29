import { Kbd, Tabs, Tooltip } from '@heroui/react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveSelectedView, views } from './view-tabs-model';

/**
 * The view switcher: stock primary link tabs (routed by the shell's React Aria
 * RouterProvider, so selection follows the URL). Each built view's tooltip
 * names its `g` shortcut; views not built yet keep HeroUI's disabled look
 * (stock, so no hover tooltip: a disabled tab takes no pointer events).
 */
export const ViewTabs = () => {
    const { pathname } = useLocation();
    return (
        <Tabs className="view-tabs max-md:hidden" selectedKey={resolveSelectedView(pathname)}>
            <Tabs.ListContainer>
                <Tabs.List aria-label="Views">
                    {views.map(view =>
                        view.href ? (
                            <Tabs.Tab href={view.href} id={view.id} key={view.id}>
                                <TabHint
                                    hint={
                                        <span className="inline-flex items-center gap-2">
                                            {view.label}
                                            <span className="inline-flex gap-0.5">
                                                <Kbd>
                                                    <Kbd.Content>G</Kbd.Content>
                                                </Kbd>
                                                <Kbd>
                                                    <Kbd.Content>
                                                        {view.shortcut.toUpperCase()}
                                                    </Kbd.Content>
                                                </Kbd>
                                            </span>
                                        </span>
                                    }
                                >
                                    {view.label}
                                </TabHint>
                                <Tabs.Indicator />
                            </Tabs.Tab>
                        ) : (
                            // HeroUI's disabled look; a disabled tab takes no pointer, so it says why in text.
                            <Tabs.Tab
                                className="view-tabs__soon"
                                id={view.id}
                                isDisabled
                                key={view.id}
                            >
                                {view.label}
                                <span className="sr-only"> (coming soon)</span>
                            </Tabs.Tab>
                        )
                    )}
                </Tabs.List>
            </Tabs.ListContainer>
        </Tabs>
    );
};

const TabHint = ({ children, hint }: { children: ReactNode; hint: ReactNode }) => (
    <Tooltip>
        <Tooltip.Trigger<'span'> render={props => <span {...props} />}>{children}</Tooltip.Trigger>
        <Tooltip.Content placement="bottom">{hint}</Tooltip.Content>
    </Tooltip>
);
