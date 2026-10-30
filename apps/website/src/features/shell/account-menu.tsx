import { Avatar, Button, Dropdown, Label, Separator, Tooltip } from '@heroui/react';
import {
    Key01Icon,
    Logout01Icon,
    Settings01Icon,
    TaskDaily01Icon,
    UserIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { Key } from 'react-aria-components';
import { Icon } from '@/components/ui/icon';
import type { SettingsPage } from '@/features/settings/settings-navigation';
import { initials } from '@/lib/initials';

/**
 * The banner's last control: the person's initials on a filled circle (mock `ZK`), opening the
 * account menu, which is also the way to Settings and Logs.
 */
export const AccountMenu = ({
    onOpenSettings,
}: {
    onOpenSettings: (page: SettingsPage) => void;
}) => {
    const name = 'Merchbase account';

    const handleAction = (key: Key) => {
        switch (key) {
            case 'settings':
                onOpenSettings('general');
                return;
            case 'account':
                onOpenSettings('account');
                return;
            case 'access':
                onOpenSettings('api');
                return;
            case 'sign-out':
                window.location.assign('/cdn-cgi/access/logout');
                return;
            default:
                return;
        }
    };

    return (
        <Dropdown>
            <Tooltip>
                <Button aria-label="Account menu" isIconOnly size="sm" variant="ghost">
                    <Avatar color="danger" size="sm">
                        <Avatar.Fallback>{initials(name)}</Avatar.Fallback>
                    </Avatar>
                </Button>
                <Tooltip.Content placement="bottom">{name}</Tooltip.Content>
            </Tooltip>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={handleAction}>
                    <Dropdown.Item id="settings" textValue="Settings">
                        <Icon icon={Settings01Icon} />
                        <Label>Settings</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="account" textValue="Account">
                        <Icon icon={UserIcon} />
                        <Label>Account</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="access" textValue="Access and usage">
                        <Icon icon={Key01Icon} />
                        <Label>Access and usage</Label>
                    </Dropdown.Item>
                    <Dropdown.Item href="/logs" id="logs" textValue="Logs">
                        <Icon icon={TaskDaily01Icon} />
                        <Label>Logs</Label>
                    </Dropdown.Item>
                    <Separator />
                    <Dropdown.Item id="sign-out" textValue="Sign out">
                        <Icon icon={Logout01Icon} />
                        <Label>Sign out</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
};
