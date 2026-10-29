import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from '@hugeicons/react';

type IconProps = HugeiconsIconProps;

/** A glyph from `@hugeicons-pro/core-stroke-rounded`, for props and lookup tables. */
export type IconGlyph = IconSvgElement;

/**
 * The one icon entry point. Glyphs come from `@hugeicons-pro/core-stroke-rounded`
 * and stay decorative unless the call site names them with `aria-label`.
 */
export const Icon = ({ 'aria-label': ariaLabel, ...props }: IconProps) => (
    <HugeiconsIcon aria-hidden={ariaLabel ? undefined : true} aria-label={ariaLabel} {...props} />
);
