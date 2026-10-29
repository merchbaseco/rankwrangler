import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    Add01Icon,
    ArrowUpRight01Icon,
    Compass01Icon,
    Copy01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import type { Key } from 'react-aria-components';
import { Icon } from '@/components/ui/icon';
import { productHref } from '@/features/explore/product-links';
import { useRowMenuTarget } from '@/hooks/use-row-menu-target';
import { keywordRowIdAttribute } from './keyword-cells';
import { isTrackable, type KeywordRow } from './keyword-model';

/**
 * One context menu for the whole directory table, opened by right-click or
 * from a focused row with the platform shortcut (useRowMenuTarget). Untracking
 * has no server operation, so only dropped and untracked rows offer Track.
 */
export const KeywordRowMenu = ({
    children,
    onTrack,
    rows,
}: {
    children: ReactNode;
    onTrack: (term: string) => void;
    rows: readonly KeywordRow[];
}) => {
    const { target, triggerProps } = useRowMenuTarget(keywordRowIdAttribute, id =>
        rows.find(candidate => candidate.id === id)
    );

    const handleAction = (key: Key) => {
        if (!target) {
            return;
        }
        switch (key) {
            case 'copy':
                navigator.clipboard.writeText(target.term).catch((error: unknown) => {
                    console.error('Copy keyword failed', error);
                });
                return;
            case 'track':
                onTrack(target.term);
                return;
            default:
                return;
        }
    };

    const top = target?.shelf[0];

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="flex min-h-0 flex-1 flex-col" {...triggerProps}>
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu
                    aria-label={target ? `Actions for ${target.term}` : 'Keyword actions'}
                    onAction={handleAction}
                >
                    <ContextMenu.Item
                        href={target ? `/explore?q=${encodeURIComponent(target.term)}` : undefined}
                        id="explore"
                        textValue="Explore products"
                    >
                        <Icon icon={Compass01Icon} />
                        <Label>Explore products</Label>
                    </ContextMenu.Item>
                    {top ? (
                        <ContextMenu.Item
                            href={productHref({ asin: top.asin, marketplaceId: 'ATVPDKIKX0DER' })}
                            id="top"
                            textValue="Open top product"
                        >
                            <Icon icon={ArrowUpRight01Icon} />
                            <Label>Open top product</Label>
                        </ContextMenu.Item>
                    ) : null}
                    <ContextMenu.Item id="copy" textValue="Copy keyword">
                        <Icon icon={Copy01Icon} />
                        <Label>Copy keyword</Label>
                    </ContextMenu.Item>
                    {target && isTrackable(target) ? (
                        <>
                            <ContextMenu.Separator />
                            <ContextMenu.Item id="track" textValue="Track keyword">
                                <Icon icon={Add01Icon} />
                                <Label>Track keyword</Label>
                            </ContextMenu.Item>
                        </>
                    ) : null}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
};
