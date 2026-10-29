import { Button, Spinner, ToggleButton, Toolbar, Tooltip } from '@heroui/react';
import { Segment } from '@heroui-pro/react';
import {
    Alert02Icon,
    CheckmarkCircle02Icon,
    PauseIcon,
    PlayIcon,
    RefreshIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { LogFilterMenu } from './log-filter-menu';
import { logLevelIcons, logStatusIcons, logTypeFilters } from './log-icons';
import {
    type EventLogLevel,
    type EventLogStatus,
    type EventLogTypeFilter,
    levelOptions,
    statusOptions,
} from './log-model';

/**
 * Logs' pane bar controls (the terminal filter tokens): the type segment,
 * level and status menus and Clear, then the refresh and live controls
 * trailing. The row count rides in the pane footer.
 */
export const LogToolbar = ({
    hasFilters,
    isFetching,
    isLive,
    levels,
    onClear,
    onLevelsChange,
    onLiveChange,
    onRefresh,
    onStatusesChange,
    onTypeChange,
    statuses,
    type,
}: {
    hasFilters: boolean;
    isFetching: boolean;
    isLive: boolean;
    levels: readonly EventLogLevel[];
    onClear: () => void;
    onLevelsChange: (levels: EventLogLevel[]) => void;
    onLiveChange: (isLive: boolean) => void;
    onRefresh: () => void;
    onStatusesChange: (statuses: EventLogStatus[]) => void;
    onTypeChange: (type: EventLogTypeFilter) => void;
    statuses: readonly EventLogStatus[];
    type: EventLogTypeFilter;
}) => (
    <Toolbar aria-label="Event filters" className="pane-filters">
        <Segment
            aria-label="Event type"
            onSelectionChange={key => onTypeChange(key as EventLogTypeFilter)}
            selectedKey={type}
            size="sm"
        >
            {logTypeFilters.map(filter => (
                <Segment.Item id={filter.id} key={filter.id}>
                    <Icon icon={filter.icon} />
                    {filter.label}
                </Segment.Item>
            ))}
        </Segment>
        <LogFilterMenu
            icon={Alert02Icon}
            label="Level"
            onChange={onLevelsChange}
            optionIcons={logLevelIcons}
            options={levelOptions}
            selected={levels}
        />
        <LogFilterMenu
            icon={CheckmarkCircle02Icon}
            label="Status"
            onChange={onStatusesChange}
            optionIcons={logStatusIcons}
            options={statusOptions}
            selected={statuses}
        />
        {hasFilters ? (
            <Button onPress={onClear} size="sm" variant="ghost">
                Clear
            </Button>
        ) : null}
        <span aria-hidden className="flex-1" />
        <div className="flex items-center gap-1">
            <Tooltip>
                <Button
                    aria-label="Refresh events"
                    isIconOnly
                    isPending={isFetching}
                    onPress={onRefresh}
                    size="sm"
                    variant="ghost"
                >
                    {({ isPending }) =>
                        isPending ? (
                            <Spinner color="current" size="sm" />
                        ) : (
                            <Icon icon={RefreshIcon} />
                        )
                    }
                </Button>
                <Tooltip.Content>Refresh</Tooltip.Content>
            </Tooltip>
            <ToggleButton isSelected={isLive} onChange={onLiveChange} size="sm">
                <Icon icon={isLive ? PauseIcon : PlayIcon} />
                {isLive ? 'Live' : 'Paused'}
            </ToggleButton>
        </div>
    </Toolbar>
);
