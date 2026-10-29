import { Kbd, Tabs, Tooltip } from '@heroui/react';
import { useLocation } from 'react-router-dom';
import { useViewTabHint } from './use-view-tab-hint';
import { resolveSelectedView, views } from './view-tabs-model';

/**
 * The view switcher: stock primary link tabs (routed by the shell's React Aria
 * RouterProvider, so selection follows the URL). Hovering a built view shows a
 * tooltip naming its `g` shortcut; views not built yet keep HeroUI's disabled
 * look (stock, so no hover tooltip: a disabled tab takes no pointer events).
 *
 * The tooltip is anchored to the hovered tab rather than wrapping its label: a
 * Tooltip.Trigger inside a link tab is a nested focusable that swallows the
 * tab's pointer press, so clicking a tab did nothing.
 */
export const ViewTabs = () => {
    const { pathname } = useLocation();
    const hint = useViewTabHint();
    return (
        <>
            <Tabs className="view-tabs max-md:hidden" selectedKey={resolveSelectedView(pathname)}>
                <Tabs.ListContainer>
                    <Tabs.List aria-label="Views">
                        {views.map(view =>
                            view.href ? (
                                <Tabs.Tab
                                    href={view.href}
                                    id={view.id}
                                    key={view.id}
                                    onHoverEnd={hint.hide}
                                    onHoverStart={event => hint.show(view.id, event.target)}
                                    onPressStart={hint.hide}
                                >
                                    {view.label}
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
            <Tooltip
                isOpen={hint.view !== null}
                onOpenChange={open => {
                    if (!open) {
                        hint.hide();
                    }
                }}
            >
                <Tooltip.Content placement="bottom" triggerRef={hint.anchorRef}>
                    {hint.view ? (
                        <span className="inline-flex items-center gap-2">
                            {hint.view.label}
                            <span className="inline-flex gap-0.5">
                                <Kbd>
                                    <Kbd.Content>G</Kbd.Content>
                                </Kbd>
                                <Kbd>
                                    <Kbd.Content>{hint.view.shortcut.toUpperCase()}</Kbd.Content>
                                </Kbd>
                            </span>
                        </span>
                    ) : null}
                </Tooltip.Content>
            </Tooltip>
        </>
    );
};
