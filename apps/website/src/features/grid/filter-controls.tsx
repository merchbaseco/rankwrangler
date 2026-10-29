import { Checkbox, CheckboxGroup, Label, ListBox, Radio, RadioGroup, Select } from '@heroui/react';
import { formatCount } from '@/features/bsr/bsr-format';
import { cn } from '@/lib/utils';

/** One sidebar option: its value, label, optional dot scope and result count. */
export interface FilterOption<T extends string> {
    readonly value: T;
    readonly label: string;
    /** A scope class for the leading dot (`tier-hot`, `heat-warm`); omitted draws none. */
    readonly dot?: string;
    readonly count?: number | null;
}

/**
 * A multi-select group of stock Checkboxes under its own Label (the group's
 * heading and accessible name), each trailing its count (Grid J Tier, Niche).
 */
export const FilterChecks = <T extends string>({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (value: T[]) => void;
    options: readonly FilterOption<T>[];
    value: readonly T[];
}) => (
    <CheckboxGroup
        className="filter-options"
        onChange={next => onChange(options.map(o => o.value).filter(v => next.includes(v)))}
        value={[...value]}
    >
        <Label>{label}</Label>
        {options.map(option => (
            <Checkbox key={option.value} value={option.value}>
                <Checkbox.Content>
                    <Checkbox.Control>
                        <Checkbox.Indicator />
                    </Checkbox.Control>
                    <OptionLabel option={option} />
                </Checkbox.Content>
            </Checkbox>
        ))}
    </CheckboxGroup>
);

/** A single choice of stock Radios under its Label, with counts (Grid J Published). */
export const FilterRadios = <T extends string>({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (value: T) => void;
    options: readonly FilterOption<T>[];
    value: T;
}) => (
    <RadioGroup
        className="filter-options"
        onChange={next => {
            const option = options.find(candidate => candidate.value === next);
            if (option) {
                onChange(option.value);
            }
        }}
        value={value}
    >
        <Label>{label}</Label>
        {options.map(option => (
            <Radio key={option.value} value={option.value}>
                <Radio.Content>
                    <Radio.Control>
                        <Radio.Indicator />
                    </Radio.Control>
                    <OptionLabel option={option} />
                </Radio.Content>
            </Radio>
        ))}
    </RadioGroup>
);

/** A stock full-width Select under its Label, over a fixed list (Grid J Sort by, Price). */
export const FilterSelect = <T extends string>({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (value: T) => void;
    options: readonly { readonly value: T; readonly label: string }[];
    value: T;
}) => (
    <Select
        fullWidth
        onChange={next => {
            const option = options.find(candidate => candidate.value === next);
            if (option) {
                onChange(option.value);
            }
        }}
        value={value}
    >
        <Label>{label}</Label>
        <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
            <ListBox>
                {options.map(option => (
                    <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
                        <Label>{option.label}</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                ))}
            </ListBox>
        </Select.Popover>
    </Select>
);

/** `214`, `612,904`, `2.41M`: counts stay exact until they need a unit. */
export const formatFilterCount = (count: number) =>
    count >= 1_000_000 ? `${(count / 1_000_000).toFixed(2)}M` : formatCount(count);

const OptionLabel = <T extends string>({ option }: { option: FilterOption<T> }) => (
    <span className="filter-option">
        {option.dot ? <span aria-hidden className={cn('filter-option__dot', option.dot)} /> : null}
        <span className="truncate">{option.label}</span>
        {option.count === undefined ? null : (
            <span className="filter-count">
                {option.count === null ? '…' : formatFilterCount(option.count)}
            </span>
        )}
    </span>
);
