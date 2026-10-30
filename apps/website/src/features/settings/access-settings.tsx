import { Link, Meter } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import {
    Analytics01Icon,
    LinkSquare02Icon,
    ShieldKeyIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { useAccessUsage } from '@/hooks/use-access-usage';
import { SettingsPageHeader } from './settings-page-header';

const accountUrl = 'https://merchbase.co/account';

export const AccessSettings = () => {
    const { isLoading, usage } = useAccessUsage();
    const usageToday = usage?.usageToday ?? 0;
    const dailyLimit = usage?.usageLimit ?? 0;
    const isUnlimited = dailyLimit === -1;
    const percent =
        isUnlimited || dailyLimit <= 0 ? 0 : Math.min(100, (usageToday / dailyLimit) * 100);

    return (
        <div className="flex flex-col gap-4">
            <SettingsPageHeader
                description="Your API usage today and where your credentials live."
                title="Access and usage"
            />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Usage</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Icon>
                            <Icon icon={Analytics01Icon} />
                        </ItemCard.Icon>
                        <ItemCard.Content>
                            <ItemCard.Title>Requests today</ItemCard.Title>
                            <ItemCard.Description>
                                {usageDescription({ dailyLimit, isLoading, isUnlimited, percent })}
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <div className="flex w-48 items-center gap-3">
                                <Meter
                                    aria-label="Share of the daily request limit used"
                                    className="flex-1"
                                    size="sm"
                                    value={isUnlimited ? 0 : percent}
                                >
                                    <Meter.Track>
                                        <Meter.Fill />
                                    </Meter.Track>
                                </Meter>
                                <span className="font-mono font-semibold">
                                    {usageToday.toLocaleString('en-US')}
                                </span>
                            </div>
                        </ItemCard.Action>
                    </ItemCard>
                </ItemCardGroup>
            </ItemCardGroup>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Access</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Icon>
                            <Icon icon={ShieldKeyIcon} />
                        </ItemCard.Icon>
                        <ItemCard.Content>
                            <ItemCard.Title>Merchbase account</ItemCard.Title>
                            <ItemCard.Description>
                                Web sessions and API credentials come from your Merchbase account.
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <Link href={accountUrl} rel="noreferrer" target="_blank">
                                Manage API access
                                <Link.Icon>
                                    <Icon icon={LinkSquare02Icon} />
                                </Link.Icon>
                            </Link>
                        </ItemCard.Action>
                    </ItemCard>
                </ItemCardGroup>
            </ItemCardGroup>
        </div>
    );
};

const usageDescription = ({
    dailyLimit,
    isLoading,
    isUnlimited,
    percent,
}: {
    dailyLimit: number;
    isLoading: boolean;
    isUnlimited: boolean;
    percent: number;
}) => {
    if (isLoading) {
        return 'Loading…';
    }
    if (isUnlimited) {
        return 'No daily limit on this account.';
    }
    return `${Math.round(percent)}% of ${dailyLimit.toLocaleString('en-US')} a day`;
};
