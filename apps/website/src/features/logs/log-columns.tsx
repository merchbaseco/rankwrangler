import type { DataGridColumn } from '@heroui-pro/react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { Icon } from '@/components/ui/icon';
import { logTypeIcon } from './log-icons';
import {
    chipInk,
    type EventLogRow,
    formatLogClock,
    formatLogTime,
    getTargetLabel,
    levelChipColor,
    statusChipColor,
} from './log-model';

/**
 * The event table's columns, in the figures face: level and status are
 * coloured words rather than chips. The target and message are data a person
 * copies, so they opt back into text selection.
 */
export const logColumns: DataGridColumn<EventLogRow>[] = [
    {
        cell: log => (
            <span className="whitespace-nowrap text-muted" data-log-row-id={log.id}>
                {/* Phones read the clock alone; the sheet has the full date. */}
                <span className="max-md:hidden">{formatLogTime(log.occurredAt)}</span>
                <span className="md:hidden">{formatLogClock(log.occurredAt)}</span>
            </span>
        ),
        header: 'Time',
        id: 'occurredAt',
        width: 156,
    },
    {
        cell: log => <span className={chipInk[levelChipColor[log.level]]}>{log.level}</span>,
        header: 'Level',
        id: 'level',
        cellClassName: 'grid-col--secondary',
        headerClassName: 'grid-col--secondary',
        width: 72,
    },
    {
        cell: log => <span data-selectable-text>{log.action}</span>,
        header: 'Action',
        id: 'action',
        cellClassName: 'grid-col--secondary',
        headerClassName: 'grid-col--secondary',
        isRowHeader: true,
        minWidth: 160,
        width: 220,
    },
    {
        cell: log => (
            <span className="inline-flex items-center gap-1.5 text-muted">
                <Icon icon={logTypeIcon(log.primitiveType)} size={13} />
                {log.primitiveType}
            </span>
        ),
        header: 'Type',
        id: 'primitiveType',
        cellClassName: 'grid-col--wide',
        headerClassName: 'grid-col--wide',
        width: 96,
    },
    {
        cell: log => (
            <span className="block truncate text-muted" data-selectable-text>
                {getTargetLabel(log)}
            </span>
        ),
        header: 'Target',
        id: 'target',
        cellClassName: 'grid-col--wide',
        headerClassName: 'grid-col--wide',
        minWidth: 140,
        width: 200,
    },
    {
        cell: log => (
            <CursorTooltip
                content={log.message}
                // Zero intrinsic width: the message takes the width the other columns leave.
                triggerClassName="block w-0 min-w-full truncate"
            >
                <span data-selectable-text>{log.message}</span>
            </CursorTooltip>
        ),
        header: 'Message',
        id: 'message',
        minWidth: 240,
    },
    {
        align: 'end',
        cell: log => <span className={chipInk[statusChipColor[log.status]]}>{log.status}</span>,
        header: 'Status',
        id: 'status',
        width: 88,
    },
];
