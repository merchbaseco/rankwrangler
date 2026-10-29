import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArrowUpRight01Icon,
    Copy01Icon,
    FileViewIcon,
    Tag01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import type { Key } from 'react-aria-components';
import { Icon } from '@/components/ui/icon';
import { useRowMenuTarget } from '@/hooks/use-row-menu-target';
import { type EventLogRow, logSubjectHref, resolveLogSubject } from './log-model';

/**
 * The Time cell carries `data-log-row-id` (log-columns.tsx), so a right-click
 * or a keyboard open anywhere in a row finds which event it is.
 */
const logRowIdAttribute = 'data-log-row-id';

/**
 * One context menu for the whole event table, opened by right-click or from
 * a focused row with the platform shortcut (useRowMenuTarget).
 */
export const LogRowContextMenu = ({
    children,
    logs,
    onShowDetails,
}: {
    children: ReactNode;
    logs: readonly EventLogRow[];
    onShowDetails: (id: string) => void;
}) => {
    const { target, triggerProps } = useRowMenuTarget(logRowIdAttribute, id =>
        logs.find(candidate => candidate.id === id)
    );

    const subject = target ? resolveLogSubject(target) : null;
    const href = subject ? logSubjectHref(subject) : null;

    const handleAction = (key: Key) => {
        if (!target) {
            return;
        }
        switch (key) {
            case 'copy-message':
                copyText(target.message);
                return;
            case 'copy-target':
                if (subject?.kind === 'product') {
                    copyText(subject.asin);
                } else if (subject?.kind === 'keyword') {
                    copyText(subject.keyword);
                }
                return;
            case 'details':
                onShowDetails(target.id);
                return;
            default:
                return;
        }
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="flex min-h-0 flex-1 flex-col" {...triggerProps}>
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu aria-label="Event actions" onAction={handleAction}>
                    {href && subject?.kind !== 'none' ? (
                        <ContextMenu.Item href={href} id="open" textValue="Open">
                            <Icon
                                icon={subject?.kind === 'keyword' ? Tag01Icon : ArrowUpRight01Icon}
                            />
                            <Label>
                                {subject?.kind === 'keyword' ? 'Open keyword' : 'Open product'}
                            </Label>
                        </ContextMenu.Item>
                    ) : null}
                    <ContextMenu.Item id="copy-message" textValue="Copy message">
                        <Icon icon={Copy01Icon} />
                        <Label>Copy message</Label>
                    </ContextMenu.Item>
                    {subject?.kind === 'product' || subject?.kind === 'keyword' ? (
                        <ContextMenu.Item id="copy-target" textValue="Copy target">
                            <Icon icon={Copy01Icon} />
                            <Label>
                                {subject.kind === 'product' ? 'Copy ASIN' : 'Copy keyword'}
                            </Label>
                        </ContextMenu.Item>
                    ) : null}
                    <ContextMenu.Separator />
                    <ContextMenu.Item id="details" textValue="Show details">
                        <Icon icon={FileViewIcon} />
                        <Label>Show details</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
};

const copyText = (value: string) => {
    navigator.clipboard.writeText(value).catch((error: unknown) => {
        console.error('Copy to clipboard failed', error);
    });
};
