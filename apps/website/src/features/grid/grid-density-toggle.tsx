import { ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react';
import { Image02Icon, Menu01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { useDensity } from '@/hooks/use-density';
import { isDensity } from '@/lib/density';

/**
 * The app-wide row-density switch in a grid's pager (Settings › General has
 * the same setting): a stock single-select ToggleButtonGroup of two icon
 * toggles, each named in its tooltip. Comfortable is Grid J's 56px art rows,
 * compact the 24px line.
 */
export const GridDensityToggle = () => {
    const { density, setDensity } = useDensity();
    return (
        <ToggleButtonGroup
            aria-label="Row density"
            disallowEmptySelection
            onSelectionChange={keys => {
                const [key] = [...keys];
                if (isDensity(key)) {
                    setDensity(key);
                }
            }}
            selectedKeys={[density]}
            selectionMode="single"
            size="sm"
        >
            <Tooltip>
                <ToggleButton
                    aria-label="Comfortable rows with design art"
                    id="comfortable"
                    isIconOnly
                >
                    <Icon icon={Image02Icon} />
                </ToggleButton>
                <Tooltip.Content placement="top">Comfortable rows, everywhere</Tooltip.Content>
            </Tooltip>
            <Tooltip>
                <ToggleButton aria-label="Compact rows" id="compact" isIconOnly>
                    <Icon icon={Menu01Icon} />
                </ToggleButton>
                <Tooltip.Content placement="top">Compact rows, everywhere</Tooltip.Content>
            </Tooltip>
        </ToggleButtonGroup>
    );
};
