import { useEffect } from "react";
import type { License } from "../../types/license";
import { useLicenseValidate } from "./use-license-validate";

/**
 * Custom hook that handles automatic license validation when needed
 */
export const useLicenseAutoValidation = (
	license: License | null | undefined,
) => {
	const { validate, isValidating } = useLicenseValidate();

	useEffect(() => {
		if (license?.key && !license.isValid && !isValidating) {
			const oneHourAgo = Date.now() - 60 * 60 * 1000;
			const needsValidation =
				!license.lastValidated || license.lastValidated < oneHourAgo;

			if (needsValidation) {
				validate(license.key);
			}
		}
	}, [license, validate, isValidating]);

	return { isValidating };
};
