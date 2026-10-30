import {
    Key01Icon,
    Notification01Icon,
    Settings02Icon,
    UserIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconGlyph } from '@/components/ui/icon';

/** A page the shell can open Settings on. System metrics live on System Status (`/status`). */
export type SettingsPage = 'general' | 'api' | 'notifications' | 'account';

export const settingsSections: ReadonlyArray<{
    readonly icon: IconGlyph;
    readonly id: SettingsPage;
    readonly label: string;
}> = [
    { icon: Settings02Icon, id: 'general', label: 'General' },
    { icon: Key01Icon, id: 'api', label: 'Access and usage' },
    { icon: Notification01Icon, id: 'notifications', label: 'Notifications' },
    { icon: UserIcon, id: 'account', label: 'Account' },
];
