import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLicense } from "../hooks/useLicense";
import LicenseEditor from "./license-editor";
import LicenseInfo from "./license-info";

const LicenseSection = () => {
	const [message, setMessage] = useState("");
	const [isEditMode, setIsEditMode] = useState(false);

	const {
		status: licenseStatus,
		isLoading: isInitialLoading,
		validate,
		isValidating,
		save,
		isSaving,
		saveSuccess,
		saveError,
	} = useLicense();

	// Handle auto-validation on load if license needs validation
	useEffect(() => {
		if (
			licenseStatus?.licenseKey &&
			!licenseStatus.isValid &&
			licenseStatus.error === "License needs validation" &&
			!isValidating
		) {
			validate(licenseStatus.licenseKey);
		}
	}, [licenseStatus, validate, isValidating]);

	// Set initial edit mode based on license status
	useEffect(() => {
		if (licenseStatus && !isInitialLoading) {
			const hasValidLicense = licenseStatus.licenseKey && licenseStatus.isValid;
			setIsEditMode(!hasValidLicense);
		}
	}, [licenseStatus, isInitialLoading]);

	// Handle save success
	useEffect(() => {
		if (saveSuccess && licenseStatus?.isValid) {
			setIsEditMode(false);
			setMessage("License saved successfully!");
		} else if (saveSuccess && licenseStatus && !licenseStatus.isValid) {
			setMessage(licenseStatus.error || "License is invalid");
		}
	}, [saveSuccess, licenseStatus]);

	// Handle save error
	useEffect(() => {
		if (saveError) {
			setMessage(saveError.message || "Failed to save license");
		}
	}, [saveError]);

	const getLicenseStatusBadge = () => {
		if (isValidating) {
			return <Badge variant="secondary">Validating...</Badge>;
		}

		if (!licenseStatus?.licenseKey) {
			return <Badge variant="destructive">No License</Badge>;
		}

		if (licenseStatus.error === "License needs validation") {
			return <Badge variant="outline">Needs Validation</Badge>;
		}

		if (licenseStatus.isValid) {
			// Show usage status if we have license data
			if (licenseStatus.licenseData) {
				const usage = licenseStatus.licenseData.usageToday;
				const limit = licenseStatus.licenseData.dailyLimit;
				const usagePercent = (usage / limit) * 100;

				if (usagePercent >= 90) {
					return <Badge variant="destructive">Limit Reached</Badge>;
				} else if (usagePercent >= 75) {
					return <Badge variant="outline">High Usage</Badge>;
				}
			}
			return <Badge variant="default">Valid</Badge>;
		}

		return <Badge variant="destructive">Invalid</Badge>;
	};

	const handleSaveLicense = (licenseKey: string) => {
		if (!licenseKey.trim()) {
			setMessage("Please enter a license key");
			return;
		}
		setMessage("");
		save(licenseKey);
	};

	const enterEditMode = () => {
		setIsEditMode(true);
		setMessage("");
	};

	const cancelEdit = () => {
		setIsEditMode(false);
		setMessage("");
	};

	// Show loading state
	if (isInitialLoading || isValidating) {
		return (
			<div className="flex flex-col items-center justify-center py-8 space-y-3">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
				<div className="text-sm text-muted-foreground">
					{isInitialLoading ? "Loading license..." : "Validating license..."}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* License status badge */}
			<div className="flex justify-between items-center">
				<span className="text-sm font-medium">License Status</span>
				{getLicenseStatusBadge()}
			</div>

			{/* License information or editor */}
			{isEditMode ? (
				<LicenseEditor
					onSave={handleSaveLicense}
					onCancel={cancelEdit}
					isSaving={isSaving}
					hasExistingLicense={!!licenseStatus?.licenseKey}
				/>
			) : (
				<>
					{licenseStatus && <LicenseInfo licenseStatus={licenseStatus} />}
					{licenseStatus?.licenseKey && licenseStatus.isValid && (
						<div className="flex">
							<Button variant="outline" onClick={enterEditMode} size="sm">
								Edit License
							</Button>
						</div>
					)}
				</>
			)}

			{/* Status message */}
			{message && (
				<div
					className={`text-sm p-2 rounded ${
						message.includes("success") || message.includes("valid")
							? "bg-green-50 text-green-700 border border-green-200"
							: "bg-red-50 text-red-700 border border-red-200"
					}`}
				>
					{message}
				</div>
			)}
		</div>
	);
};

export default LicenseSection;
