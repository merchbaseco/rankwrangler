import { createContext, type PropsWithChildren, type ReactNode, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The banner's search slot, after the view tabs. Each page
 * renders its <ShellSearch> (through <PageToolbar>) anywhere in its tree and it
 * portals here, so the prompt searches whatever that page is about.
 */
export const PageToolbarProvider = ({ children }: PropsWithChildren) => {
    const [host, setHost] = useState<HTMLElement | null>(null);
    return <PageToolbarContext value={{ host, setHost }}>{children}</PageToolbarContext>;
};

/** The slot element itself, rendered once by the banner. */
export const PageToolbarSlot = () => {
    const context = useContext(PageToolbarContext);
    return <div className="page-toolbar" ref={context?.setHost ?? undefined} />;
};

export const PageToolbar = ({ children }: { children: ReactNode }) => {
    const host = useContext(PageToolbarContext)?.host;
    return host ? createPortal(children, host) : null;
};

interface PageToolbarContextValue {
    readonly host: HTMLElement | null;
    readonly setHost: (element: HTMLElement | null) => void;
}

const PageToolbarContext = createContext<PageToolbarContextValue | null>(null);
