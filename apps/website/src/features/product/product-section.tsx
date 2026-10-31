import type { ReactNode } from 'react';

/**
 * One section of the Product page's main column, ruled off from the one
 * above: a 44px bar (the title in ink, muted context after it, trailing
 * actions) over the section's body.
 */
export const ProductSection = ({
    actions,
    children,
    context,
    title,
}: {
    actions?: ReactNode;
    children: ReactNode;
    context?: ReactNode;
    title: string;
}) => (
    <section aria-label={title} className="product-section">
        <div className="product-section__bar">
            <h2 className="product-section__title">{title}</h2>
            {context ? <span className="product-section__context">{context}</span> : null}
            <span aria-hidden className="flex-1" />
            {actions}
        </div>
        {children}
    </section>
);
