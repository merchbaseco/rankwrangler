import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLicenseSave } from "../hooks/use-license-save";
import { LicenseMessage } from "./license-message";

interface LicenseEditorProps {
	onCancel: () => void;
	onSuccess: () => void;
	hasExistingLicense: boolean;
}

const LicenseEditor = ({
	onCancel,
	onSuccess,
	hasExistingLicense,
}: LicenseEditorProps) => {
	const [licenseInput, setLicenseInput] = useState("");
	const [message, setMessage] = useState("");

	const { save, isSaving, saveSuccess, saveError } = useLicenseSave();

	// Handle save success
	useEffect(() => {
		if (saveSuccess) {
			setMessage("License saved successfully!");
			setTimeout(() => {
				onSuccess();
			}, 1000); // Show success message briefly before closing
		}
	}, [saveSuccess, onSuccess]);

	// Handle save error
	useEffect(() => {
		if (saveError) {
			setMessage(saveError.message || "Failed to save license");
		}
	}, [saveError]);

	const handleSave = () => {
		const trimmedKey = licenseInput.trim();
		if (!trimmedKey) {
			setMessage("Please enter a license key");
			return;
		}
		setMessage("");
		save(trimmedKey);
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && licenseInput.trim() && !isSaving) {
			handleSave();
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex gap-2">
				<Input
					autoFocus
					className="text-sm"
					disabled={isSaving}
					onChange={(e) => setLicenseInput(e.target.value)}
					onKeyPress={handleKeyPress}
					placeholder="Enter license key..."
					type="password"
					value={licenseInput}
				/>
				<Button
					disabled={isSaving || !licenseInput.trim()}
					onClick={handleSave}
					size="sm"
				>
					{isSaving ? "Saving..." : "Save"}
				</Button>
			</div>

			{hasExistingLicense && (
				<div className="flex">
					<Button
						disabled={isSaving}
						onClick={onCancel}
						size="sm"
						variant="outline"
					>
						Cancel
					</Button>
				</div>
			)}

			{message && (
				<LicenseMessage
					autoDismiss={saveSuccess}
					message={message}
					onDismiss={() => setMessage("")}
					type={saveSuccess ? "success" : "error"}
				/>
			)}
		</div>
	);
};

export default LicenseEditor;
