import { Button, Dropdown } from '@heroui/react';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import type { Key, Selection } from 'react-aria-components';
import { Icon } from '@/components/ui/icon';

/**
 * A pane bar filter token (explore-terminal mock: `niche:any`, now `Niche Any ▾`):
 * a compact ghost Button reading the name and value that opens a stock single-select
 * Dropdown. Items are the caller's `Dropdown.Item`s, each with an icon,
 * Label and ItemIndicator.
 */
export const FilterTokenMenu = ({
    children,
    label,
    name,
    onSelect,
    selectedKey,
    value,
}: {
    children: ReactNode;
    label: string;
    name: string;
    onSelect: (key: string) => void;
    selectedKey: string;
    value: string;
}) => (
    <Dropdown>
        <Button size="sm" variant="ghost">
            <FilterToken name={name} value={value} />
        </Button>
        <Dropdown.Popover placement="bottom start">
            <Dropdown.Menu
                aria-label={label}
                disallowEmptySelection
                onSelectionChange={(keys: Selection) => {
                    const key = firstKey(keys);
                    if (key !== null) {
                        onSelect(String(key));
                    }
                }}
                selectedKeys={[selectedKey]}
                selectionMode="single"
            >
                {children}
            </Dropdown.Menu>
        </Dropdown.Popover>
    </Dropdown>
);

/**
 * `Name Value ▾`: the filter's name muted, its current value in ink, and a
 * chevron that says the token opens a menu. Both read in sentence case.
 */
export const FilterToken = ({ name, value }: { name: string; value: string }) => (
    <span className="inline-flex items-center gap-1.5">
        <span className="text-muted">{sentenceCase(name)}</span>
        {sentenceCase(value)}
        <Icon className="text-muted" icon={ArrowDown01Icon} size={12} />
    </span>
);

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const firstKey = (keys: Selection): Key | null =>
    keys === 'all' ? null : (keys.values().next().value ?? null);
