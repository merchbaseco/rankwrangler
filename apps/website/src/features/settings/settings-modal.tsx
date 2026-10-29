import { Modal, Tabs, useMediaQuery } from '@heroui/react';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { AccessSettings } from './access-settings';
import { AccountSettings } from './account-settings';
import { GeneralSettings } from './general-settings';
import { NotificationSettings } from './notification-settings';
import { type SettingsPage, settingsSections } from './settings-navigation';

/**
 * Settings: a stock Modal holding vertical Tabs (a horizontal row on a phone),
 * one tab per section. System metrics live on System Status (`/status`), not here.
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
    // A phone has no room for the rail beside the page, so the sections become a scrolling row.
    const isWide = useMediaQuery('(min-width: 48rem)', { initializeWithValue: true });
    const [section, setSection] = useState<SettingsPage>(initialPage);

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
                            onSelectionChange={key => setSection(key as SettingsPage)}
                            orientation={isWide ? 'vertical' : 'horizontal'}
                            selectedKey={section}
                        >
                            <Tabs.ListContainer className="max-md:overflow-x-auto">
                                <Tabs.List aria-label="Settings sections">
                                    {settingsSections.map(item => (
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
                        </Tabs>
                    </Modal.Body>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
};
