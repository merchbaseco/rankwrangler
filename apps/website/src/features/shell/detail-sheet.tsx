import { useMediaQuery } from '@heroui/react';
import { Sheet } from '@heroui-pro/react';
import { type ReactNode, useCallback, useState } from 'react';
import { focusRow } from './use-row-cursor';

/**
 * A phone's row detail: the stock bottom Sheet (drag handle, close button,
 * heading, scrolling body, optional actions) holding the same content the
 * side pane shows on wider screens. Once it has closed, focus returns to the
 * row it describes (`returnFocus`), however it was opened.
 */
export const DetailSheet = ({
    actions,
    children,
    heading,
    isOpen,
    onOpenChange,
    returnFocus,
}: {
    actions?: ReactNode;
    children: ReactNode;
    heading: string;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    /** The row cell attribute and id to focus after the sheet closes. */
    returnFocus: { readonly attribute: string; readonly id: string };
}) => (
    <Sheet
        isOpen={isOpen}
        onAnimationEnd={open => {
            if (!open) {
                focusRow(returnFocus.attribute, returnFocus.id);
            }
        }}
        onOpenChange={onOpenChange}
        placement="bottom"
    >
        <Sheet.Backdrop>
            <Sheet.Content>
                <Sheet.Dialog>
                    <Sheet.Handle />
                    <Sheet.CloseTrigger />
                    <Sheet.Header>
                        <Sheet.Heading>{heading}</Sheet.Heading>
                    </Sheet.Header>
                    <Sheet.Body>{children}</Sheet.Body>
                    {actions ? <Sheet.Footer>{actions}</Sheet.Footer> : null}
                </Sheet.Dialog>
            </Sheet.Content>
        </Sheet.Backdrop>
    </Sheet>
);

/**
 * Whether row details live in a sheet (phones, where the panes would split the
 * screen) and the sheet's open state. On wider screens it never opens.
 */
export const useDetailSheet = () => {
    const isPhone = useMediaQuery(phoneQuery, { initializeWithValue: true });
    const [isOpen, setIsOpen] = useState(false);
    const open = useCallback(() => setIsOpen(true), []);
    return { isOpen: isPhone && isOpen, isPhone, onOpenChange: setIsOpen, open };
};

/** The phone breakpoint the theme stacks and trims at (`md`, 48rem). */
const phoneQuery = '(width < 48rem)';
