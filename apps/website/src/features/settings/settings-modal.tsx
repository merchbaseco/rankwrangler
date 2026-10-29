import { Modal, Tabs, useMediaQuery } from '@heroui/react';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { AccessSettings } from './access-settings';
import { AccountSettings } from './account-settings';
import { GeneralSettings } from './general-settings';
import { MetricsSettings } from './metrics/metrics-settings';
import { NotificationSettings } from './notification-settings';
import {
    isMetricsPage,
    type MetricsPage,
    type SettingsPage,
    type SettingsSection,
    sectionOf,
    settingsSections,
} from './settings-navigation';

/**
 * Settings: a stock Modal holding vertical Tabs (a horizontal row on a phone),
 * one tab per section. Metrics
 * is one admin-only section with its own tabs, so the rail stays a short list.
 * The shell remounts this per open (`key`), so `initialPage` is read once.
 */
export const SettingsModal = ({
    initialPage = 'general',
    onOpenChange,
    open,
}: {
    initialPage?: SettingsPage;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}) => {
    const { isAdmin } = useAdminAccess();
    // A phone has no room for the rail beside the page, so the sections become a scrolling row.
    const isWide = useMediaQuery('(min-width: 48rem)', { initializeWithValue: true });
    const [section, setSection] = useState<SettingsSection>(sectionOf(initialPage));
    const [metricsPage, setMetricsPage] = useState<MetricsPage>(
        isMetricsPage(initialPage) ? initialPage : 'metrics-jobs'
    );
    const sections = settingsSections.filter(item => isAdmin || !item.adminOnly);
    const selectedSection = sections.some(item => item.id === section) ? section : 'general';

    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="cover">
                <Modal.Dialog aria-label="Settings" className="settings-modal">
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Settings</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <Tabs
                            align="start"
                            className="h-full min-h-0"
                            onSelectionChange={key => setSection(key as SettingsSection)}
                            orientation={isWide ? 'vertical' : 'horizontal'}
                            selectedKey={selectedSection}
                        >
                            <Tabs.ListContainer className="max-md:overflow-x-auto">
                                <Tabs.List aria-label="Settings sections">
                                    {sections.map(item => (
                                        <Tabs.Tab id={item.id} key={item.id}>
                                            <Icon icon={item.icon} />
                                            {item.label}
                                            <Tabs.Indicator />
                                        </Tabs.Tab>
                                    ))}
                                </Tabs.List>
                            </Tabs.ListContainer>
                            <Tabs.Panel className="min-h-0 overflow-y-auto" id="general">
                                <GeneralSettings />
                            </Tabs.Panel>
                            <Tabs.Panel className="min-h-0 overflow-y-auto" id="api">
                                <AccessSettings />
                            </Tabs.Panel>
                            <Tabs.Panel className="min-h-0 overflow-y-auto" id="notifications">
                                <NotificationSettings />
                            </Tabs.Panel>
                            <Tabs.Panel className="min-h-0 overflow-y-auto" id="account">
                                <AccountSettings />
                            </Tabs.Panel>
                            {isAdmin ? (
                                <Tabs.Panel className="min-h-0 overflow-y-auto" id="metrics">
                                    <MetricsSettings
                                        onPageChange={setMetricsPage}
                                        page={metricsPage}
                                    />
                                </Tabs.Panel>
                            ) : null}
                        </Tabs>
                    </Modal.Body>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
};
