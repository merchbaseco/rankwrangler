import { ItemCard, ItemCardGroup, Segment } from '@heroui-pro/react';
import {
    ComputerIcon,
    Image02Icon,
    Menu01Icon,
    Moon02Icon,
    Sun03Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { useDensity } from '@/hooks/use-density';
import { useTheme } from '@/hooks/use-theme';
import { type Density, isDensity } from '@/lib/density';
import type { ThemePreference } from '@/lib/theme';
import { SettingsPageHeader } from './settings-page-header';

export const GeneralSettings = () => {
    const { setTheme, theme } = useTheme();
    const { density, setDensity } = useDensity();

    return (
        <div className="flex flex-col gap-4">
            <SettingsPageHeader
                description="How RankWrangler looks on this device."
                title="General"
            />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Appearance</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Theme</ItemCard.Title>
                            <ItemCard.Description>
                                System matches your device’s setting.
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <Segment
                                aria-label="Theme"
                                onSelectionChange={key => setTheme(key as ThemePreference)}
                                selectedKey={theme}
                                size="sm"
                            >
                                {themeOptions.map(option => (
                                    <Segment.Item id={option.id} key={option.id}>
                                        <Icon icon={option.icon} />
                                        <span className="max-md:sr-only">{option.label}</span>
                                    </Segment.Item>
                                ))}
                            </Segment>
                        </ItemCard.Action>
                    </ItemCard>
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Row density</ItemCard.Title>
                            <ItemCard.Description>
                                Applies to every table: comfortable shows design art.
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <Segment
                                aria-label="Row density"
                                onSelectionChange={key => {
                                    if (isDensity(key)) {
                                        setDensity(key);
                                    }
                                }}
                                selectedKey={density}
                                size="sm"
                            >
                                {densityOptions.map(option => (
                                    <Segment.Item id={option.id} key={option.id}>
                                        <Icon icon={option.icon} />
                                        <span className="max-md:sr-only">{option.label}</span>
                                    </Segment.Item>
                                ))}
                            </Segment>
                        </ItemCard.Action>
                    </ItemCard>
                </ItemCardGroup>
            </ItemCardGroup>
        </div>
    );
};

const themeOptions = [
    { icon: Sun03Icon, id: 'light', label: 'Light' },
    { icon: Moon02Icon, id: 'dark', label: 'Dark' },
    { icon: ComputerIcon, id: 'system', label: 'System' },
] as const satisfies ReadonlyArray<{ id: ThemePreference; icon: unknown; label: string }>;

const densityOptions = [
    { icon: Image02Icon, id: 'comfortable', label: 'Comfortable' },
    { icon: Menu01Icon, id: 'compact', label: 'Compact' },
] as const satisfies ReadonlyArray<{ id: Density; icon: unknown; label: string }>;
