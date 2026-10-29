import {
    Activity01Icon,
    Key01Icon,
    Notification01Icon,
    Settings02Icon,
    UserIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconGlyph } from '@/components/ui/icon';

/** A page the shell can open Settings on. Metrics pages are admin-only. */
export type SettingsPage =
    | 'general'
    | 'api'
    | 'notifications'
    | 'account'
    | 'metrics-jobs'
    | 'metrics-keepa'
    | 'metrics-spapi'
    | 'metrics-facets'
    | 'metrics-short-names'
    | 'metrics-cutouts';

export type SettingsSection = 'general' | 'api' | 'notifications' | 'account' | 'metrics';
export type MetricsPage = Extract<SettingsPage, `metrics-${string}`>;

export const settingsSections: ReadonlyArray<{
    readonly adminOnly: boolean;
    readonly icon: IconGlyph;
    readonly id: SettingsSection;
    readonly label: string;
}> = [
    { adminOnly: false, icon: Settings02Icon, id: 'general', label: 'General' },
    { adminOnly: false, icon: Key01Icon, id: 'api', label: 'Access and usage' },
    { adminOnly: false, icon: Notification01Icon, id: 'notifications', label: 'Notifications' },
    { adminOnly: false, icon: UserIcon, id: 'account', label: 'Account' },
    { adminOnly: true, icon: Activity01Icon, id: 'metrics', label: 'Metrics' },
];

export const metricsPages: ReadonlyArray<{ readonly id: MetricsPage; readonly label: string }> = [
    { id: 'metrics-jobs', label: 'Keyword jobs' },
    { id: 'metrics-keepa', label: 'Keepa' },
    { id: 'metrics-spapi', label: 'SP-API' },
    { id: 'metrics-facets', label: 'Facets' },
    { id: 'metrics-short-names', label: 'Short names' },
    { id: 'metrics-cutouts', label: 'Cutouts' },
];

export const isMetricsPage = (page: SettingsPage): page is MetricsPage =>
    page.startsWith('metrics-');

export const sectionOf = (page: SettingsPage): SettingsSection =>
    isMetricsPage(page) ? 'metrics' : page;
