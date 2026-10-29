import { Button, Dropdown, Label, type Selection } from '@heroui/react';
import { Icon, type IconGlyph } from '@/components/ui/icon';
import { FilterToken } from '@/features/shell/filter-token-menu';

/**
 * A multi-select filter behind one outline trigger: Level or Status. The
 * trigger shows how many values are on, so an active filter stays visible
 * without opening the menu.
 */
export const LogFilterMenu = <T extends string>({
    icon,
    label,
    onChange,
    optionIcons,
    options,
    selected,
}: {
    icon: IconGlyph;
    label: string;
    onChange: (values: T[]) => void;
    optionIcons: Readonly<Record<T, IconGlyph>>;
    options: readonly T[];
    selected: readonly T[];
}) => {
    const handleSelectionChange = (keys: Selection) => {
        if (keys === 'all') {
            onChange([...options]);
            return;
        }
        onChange(options.filter(option => keys.has(option)));
    };

    return (
        <Dropdown>
            <Button size="sm" variant="ghost">
                <Icon icon={icon} />
                <FilterToken
                    name={label.toLowerCase()}
                    value={selected.length > 0 ? selected.join(', ') : 'any'}
                />
            </Button>
            <Dropdown.Popover placement="bottom start">
                <Dropdown.Menu
                    aria-label={`Filter by ${label.toLowerCase()}`}
                    onSelectionChange={handleSelectionChange}
                    selectedKeys={new Set(selected)}
                    selectionMode="multiple"
                >
                    {options.map(option => (
                        <Dropdown.Item id={option} key={option} textValue={option}>
                            <Icon icon={optionIcons[option]} />
                            <Label>{capitalize(option)}</Label>
                            <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
