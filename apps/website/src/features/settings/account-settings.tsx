import { Avatar, Button } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Logout01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { initials } from '@/lib/initials';
import { SettingsPageHeader } from './settings-page-header';

export const AccountSettings = () => {
    const name = 'Merchbase account';
    const details = 'Sign-in is managed by Cloudflare Access.';

    return (
        <div className="flex flex-col gap-4">
            <SettingsPageHeader
                description="The Merchbase identity you are signed in with."
                title="Account"
            />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Profile</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <Avatar size="sm">
                            <Avatar.Fallback>{initials(name)}</Avatar.Fallback>
                        </Avatar>
                        <ItemCard.Content>
                            <ItemCard.Title data-selectable-text>{name}</ItemCard.Title>
                            {details ? (
                                <ItemCard.Description data-selectable-text>
                                    {details}
                                </ItemCard.Description>
                            ) : null}
                        </ItemCard.Content>
                    </ItemCard>
                </ItemCardGroup>
            </ItemCardGroup>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Session</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>Sign out</ItemCard.Title>
                            <ItemCard.Description>
                                Ends this session on this device.
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <Button
                                onPress={() => {
                                    window.location.assign('/cdn-cgi/access/logout');
                                }}
                                size="sm"
                                variant="danger-soft"
                            >
                                <Icon icon={Logout01Icon} />
                                Sign out
                            </Button>
                        </ItemCard.Action>
                    </ItemCard>
                </ItemCardGroup>
            </ItemCardGroup>
        </div>
    );
};
