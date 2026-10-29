import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { Copy01Icon, GridViewIcon, Tag01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import type { Key } from 'react-aria-components';
import { Icon } from '@/components/ui/icon';
import { useRowMenuTarget } from '@/hooks/use-row-menu-target';
import { exploreKeywordHref, keywordHref } from './product-keyword-links';
import type { ProductKeyword } from './use-product-keywords';

/** The Keyword cell carries this attribute so a right-click finds its row. */
export const keywordRowAttribute = 'data-keyword-row-id';

/**
 * One context menu for the keywords grid, opened by right-click or from a
 * focused row with the platform shortcut (useRowMenuTarget).
 */
export const KeywordRowMenu = ({
    children,
    keywords,
}: {
    children: ReactNode;
    keywords: readonly ProductKeyword[];
}) => {
    const { target, triggerProps } = useRowMenuTarget(keywordRowAttribute, id =>
        keywords.find(candidate => candidate.queryId === id)
    );

    const handleAction = (key: Key) => {
        if (key === 'copy' && target) {
            navigator.clipboard.writeText(target.keyword).catch((error: unknown) => {
                console.error('Copy keyword failed', error);
            });
        }
    };

    return (
        <ContextMenu>
            {/* The trigger is inline-block by default; block lets the grid fill its widget. */}
            <ContextMenu.Trigger className="block" {...triggerProps}>
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu
                    aria-label={target ? `Actions for ${target.keyword}` : 'Keyword actions'}
                    onAction={handleAction}
                >
                    <ContextMenu.Item
                        href={target ? keywordHref(target.keyword) : undefined}
                        id="open"
                        textValue="Open keyword"
                    >
                        <Icon icon={Tag01Icon} />
                        <Label>Open keyword</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                        href={target ? exploreKeywordHref(target.keyword) : undefined}
                        id="explore"
                        textValue="Explore products for keyword"
                    >
                        <Icon icon={GridViewIcon} />
                        <Label>Explore products for keyword</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item id="copy" textValue="Copy keyword">
                        <Icon icon={Copy01Icon} />
                        <Label>Copy keyword</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
};
