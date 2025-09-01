import { Badge } from "@/components/ui/badge";
import type { License } from "@/scripts/types/license";

export const LicenseStatusBadge = ({ license }: { license?: License }) => {
	if (!license?.key) {
		return <Badge variant="destructive">Inactive</Badge>;
	}

	const oneHourAgo = Date.now() - 60 * 60 * 1000;
	const needsValidation =
		!license.lastValidated || license.lastValidated < oneHourAgo;

	if (!license.isValid || needsValidation) {
		return <Badge variant="outline">Needs Validation</Badge>;
	}

	if (license.isValid) {
		return <Badge variant="default">Active</Badge>;
	}

	return <Badge variant="destructive">Inactive</Badge>;
};
