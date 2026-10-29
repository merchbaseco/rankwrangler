import {
    Alert02Icon,
    AlertCircleIcon,
    BugIcon,
    CancelCircleIcon,
    ChartLineData01Icon,
    CheckmarkCircle02Icon,
    Clock01Icon,
    InformationCircleIcon,
    Layers01Icon,
    PieChart02Icon,
    RefreshIcon,
    Tag01Icon,
    TShirtIcon,
    WorkflowSquare10Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconGlyph } from '@/components/ui/icon';
import type { EventLogLevel, EventLogStatus, EventLogTypeFilter } from './log-model';

export const logTypeFilters: ReadonlyArray<{
    readonly icon: IconGlyph;
    readonly id: EventLogTypeFilter;
    readonly label: string;
}> = [
    { icon: Layers01Icon, id: 'all', label: 'All' },
    { icon: Tag01Icon, id: 'keyword', label: 'Keyword' },
    { icon: TShirtIcon, id: 'product', label: 'Product' },
    { icon: ChartLineData01Icon, id: 'history', label: 'History' },
    { icon: WorkflowSquare10Icon, id: 'job', label: 'Job' },
];

export const logTypeIcon = (type: EventLogTypeFilter) =>
    logTypeFilters.find(filter => filter.id === type)?.icon ?? Layers01Icon;

export const logLevelIcons: Readonly<Record<EventLogLevel, IconGlyph>> = {
    debug: BugIcon,
    error: AlertCircleIcon,
    info: InformationCircleIcon,
    warn: Alert02Icon,
};

export const logStatusIcons: Readonly<Record<EventLogStatus, IconGlyph>> = {
    failed: CancelCircleIcon,
    partial: PieChart02Icon,
    pending: Clock01Icon,
    retrying: RefreshIcon,
    success: CheckmarkCircle02Icon,
};
