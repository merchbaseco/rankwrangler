import type { LicenseStatus } from '../../content/types';

interface LicenseInfoProps {
    licenseStatus: LicenseStatus;
}

const LicenseInfo = ({ licenseStatus }: LicenseInfoProps) => {
    const getLicenseDisplayText = () => {
        if (!licenseStatus?.licenseKey) return 'No license key set';

        const key = licenseStatus.licenseKey;
        if (key.length <= 8) return key;

        return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">License:</span>
                <span className="text-sm text-muted-foreground">
                    {getLicenseDisplayText()}
                </span>
            </div>

            {licenseStatus?.licenseData && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="font-mono">
                            {licenseStatus.licenseData.email}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Usage today:</span>
                        <span className="font-mono">
                            {licenseStatus.licenseData.usageToday}/
                            {licenseStatus.licenseData.dailyLimit}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Expires:</span>
                        <span className="font-mono">
                            {new Date(
                                licenseStatus.licenseData.expiresAt
                            ).toLocaleDateString()}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LicenseInfo;