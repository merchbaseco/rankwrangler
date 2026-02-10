import type { License } from "@/scripts/types/license";

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

const COMPACT_UNIT_REGEX = /\.0([A-Za-z]+)$/;

const formatUsageValue = (value: number) => {
	if (!Number.isFinite(value)) {
		return "0";
	}

	const sanitized = Math.max(0, Math.floor(value));

	if (sanitized < 1000) {
		return sanitized.toString();
	}

	const formatted = compactNumberFormatter.format(sanitized);
	return formatted.replace(COMPACT_UNIT_REGEX, "$1");
};

const formatUsageDisplay = (usage: number, usageLimit: number) => {
	const usageText = formatUsageValue(usage);

	if (usageLimit === -1) {
		return `${usageText} Requests`;
	}

	const limitText = formatUsageValue(usageLimit);
	return `${usageText}/${limitText} Requests`;
};

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
					{formatUsageDisplay(usage, usageLimit)}
				</span>
			</div>
		</div>
	);
};

export default LicenseInfo;
