import { EmptyState } from '@heroui-pro/react';
import { Notification01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { SettingsPageHeader } from './settings-page-header';

export const NotificationSettings = () => (
    <div className="flex flex-col gap-4">
        <SettingsPageHeader
            description="Alerts when a tracked Product or keyword moves."
            title="Notifications"
        />
        <EmptyState size="sm">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={Notification01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>No alerts yet</EmptyState.Title>
                <EmptyState.Description>
                    Notification preferences arrive with alerts.
                </EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    </div>
);
