import { Button, Tooltip } from '@heroui/react';
import { Moon02Icon, Sun03Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

export const ThemeToggle = () => {
    const { resolvedTheme, setTheme } = useTheme();
    const label = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

    return (
        <Tooltip>
            <Button
                aria-label={label}
                // Phones reach the theme from Settings; the bar keeps its width for the prompt.
                className="max-md:hidden"
                isIconOnly
                onPress={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                size="sm"
                variant="ghost"
            >
                <Icon icon={resolvedTheme === 'dark' ? Sun03Icon : Moon02Icon} />
            </Button>
            <Tooltip.Content placement="bottom">{label}</Tooltip.Content>
        </Tooltip>
    );
};
