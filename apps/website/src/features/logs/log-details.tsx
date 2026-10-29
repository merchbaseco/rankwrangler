import { CloseButton, Link, Tooltip } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { DetailSheet } from '@/features/shell/detail-sheet';
import { KeyValue, Pane, PaneBar, PaneBarSpacer, PaneBody } from '@/features/shell/term-pane';
import {
    chipInk,
    type EventLogRow,
    formatLogDateTime,
    formatLogJson,
    getTargetLabel,
    levelChipColor,
    logSubjectHref,
    resolveLogSubject,
    statusChipColor,
} from './log-model';

/** The selected event in full, as a detail pane: facts, message and raw payload. */
export const LogDetails = ({ log, onClose }: { log: EventLogRow; onClose: () => void }) => (
    <Pane className="log-detail" label="Event detail">
        <PaneBar title="Event">
            <span>{formatLogDateTime(log.occurredAt)}</span>
            <PaneBarSpacer />
            <Tooltip>
                <CloseButton aria-label="Close details" onPress={onClose} />
                <Tooltip.Content>Close details</Tooltip.Content>
            </Tooltip>
        </PaneBar>
        <PaneBody>
            <LogDetailContent log={log} />
        </PaneBody>
    </Pane>
);

/** A phone's version of the pane: the same event in a bottom sheet. */
export const LogDetailSheet = ({
    isOpen,
    log,
    onOpenChange,
}: {
    isOpen: boolean;
    log: EventLogRow | null;
    onOpenChange: (isOpen: boolean) => void;
}) =>
    log ? (
        <DetailSheet
            heading={formatLogDateTime(log.occurredAt)}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            returnFocus={{ attribute: 'data-log-row-id', id: log.id }}
        >
            <LogDetailContent log={log} />
        </DetailSheet>
    ) : null;

/** The event's facts, message, raw payload and a link to what it touched. */
const LogDetailContent = ({ log }: { log: EventLogRow }) => {
    const subject = resolveLogSubject(log);
    const href = logSubjectHref(subject);
    return (
        <div className="detail-stack">
            <h2 className="term-title" data-selectable-text>
                {log.action}
            </h2>
            <dl className="key-values key-values--2">
                <KeyValue label="Level">
                    <span className={chipInk[levelChipColor[log.level]]}>{log.level}</span>
                </KeyValue>
                <KeyValue label="Status">
                    <span className={chipInk[statusChipColor[log.status]]}>{log.status}</span>
                </KeyValue>
                <KeyValue label="Type">{log.primitiveType}</KeyValue>
                <KeyValue label="Job">
                    <span className="truncate" data-selectable-text>
                        {log.jobName ?? '—'}
                    </span>
                </KeyValue>
            </dl>
            <dl className="key-values">
                <KeyValue label="Target">
                    <span className="truncate" data-selectable-text>
                        {getTargetLabel(log)}
                    </span>
                </KeyValue>
            </dl>
            <p className="font-sans" data-selectable-text>
                {log.message}
            </p>
            <pre className="term-code">{formatLogJson(log.detailsJson)}</pre>
            {href ? (
                <Link href={href}>
                    {subject.kind === 'keyword' ? 'Open keyword' : 'Open product'}
                    <Link.Icon>
                        <Icon icon={ArrowUpRight01Icon} />
                    </Link.Icon>
                </Link>
            ) : null}
        </div>
    );
};
