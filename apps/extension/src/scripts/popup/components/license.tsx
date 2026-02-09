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
		} else if (!license && !isLoading) {
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
			<div className="flex flex-col items-center justify-center py-8 space-y-3">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
				<div className="text-sm text-muted-foreground">
					Syncing license status...
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-8 space-y-3">
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
				<Button variant="outline" size="sm" onClick={() => refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* License status badge */}
			<div className="flex justify-between items-center">
				<span className="text-sm font-medium">License Status</span>
				<LicenseStatusBadge license={license} />
			</div>

			{/* License information or editor */}
			{isEditMode ? (
				<LicenseEditor
					onSuccess={handleEditSuccess}
					onCancel={handleCancelEdit}
					hasExistingLicense={!!license?.key}
				/>
			) : (
				<>
					{license && <LicenseInfo license={license} />}
					{license?.key && license.isValid && (
						<div className="w-full flex">
							<Button
								variant="outline"
								onClick={handleEnterEditMode}
								size="sm"
								className="grow"
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
