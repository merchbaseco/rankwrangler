/**
 * A settings page's identity: title and one line of what it covers. Sections
 * under it are stock ItemCardGroup/ItemCard, which own their own spacing.
 */
export const SettingsPageHeader = ({
    description,
    title,
}: {
    description: string;
    title: string;
}) => (
    <header className="px-4">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <p className="text-muted">{description}</p>
    </header>
);
