import type { License } from '@/scripts/types/license';

const LicenseInfo = ({ license }: { license: License }) => {
    const { key, email, usage, usageLimit } = license;
    const truncatedLicenseKey = `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">License:</span>
                <span className="">{truncatedLicenseKey}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-mono">{email}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Usage today:</span>
                <span className="font-mono">
                    {usageLimit === -1 ? `${usage} Requests` : `${usage}/${usageLimit} Requests`}
                </span>
            </div>
        </div>
    );
};

export default LicenseInfo;
