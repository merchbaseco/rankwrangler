import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLicenseStatus } from "../hooks/use-license-status";
import LicenseEditor from "./license-editor";
import LicenseInfo from "./license-info";
import { LicenseMessage } from "./license-message";
import { LicenseStatusBadge } from "./license-status-badge";

export const License = () => {
	const [isEditMode, setIsEditMode] = useState(false);
	const { license, isLoading, isError, error, refetch } = useLicenseStatus();

	// Set initial edit mode based on license status
	useEffect(() => {
		if (license && !isLoading) {
			const hasValidLicense = license.key && license.isValid;
			setIsEditMode(!hasValidLicense);
		} else if (!(license || isLoading)) {
			setIsEditMode(true);
		}
	}, [license, isLoading]);

	const handleEditSuccess = () => {
		setIsEditMode(false);
	};

	const handleCancelEdit = () => {
		setIsEditMode(false);
	};

	const handleEnterEditMode = () => {
		setIsEditMode(true);
	};

	// Show loading state
	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center space-y-3 py-8">
				<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
				<div className="text-muted-foreground text-sm">
					Syncing license status...
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center space-y-3 py-8">
				<div className="w-full">
					<LicenseMessage
						message={
							error instanceof Error
								? error.message
								: "Unable to reach the license server."
						}
						type="error"
					/>
				</div>
				<Button onClick={() => refetch()} size="sm" variant="outline">
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* License status badge */}
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm">License Status</span>
				<LicenseStatusBadge license={license} />
			</div>

			{/* License information or editor */}
			{isEditMode ? (
				<LicenseEditor
					hasExistingLicense={!!license?.key}
					onCancel={handleCancelEdit}
					onSuccess={handleEditSuccess}
				/>
			) : (
				<>
					{license && <LicenseInfo license={license} />}
					{license?.key && license.isValid && (
						<div className="flex w-full">
							<Button
								className="grow"
								onClick={handleEnterEditMode}
								size="sm"
								variant="outline"
							>
								Edit License
							</Button>
						</div>
					)}
				</>
			)}
		</div>
	);
};
