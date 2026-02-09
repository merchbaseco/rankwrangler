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
					placeholder="Enter license key..."
					value={licenseInput}
					onChange={(e) => setLicenseInput(e.target.value)}
					onKeyPress={handleKeyPress}
					disabled={isSaving}
					type="password"
					className="text-sm"
					autoFocus
				/>
				<Button
					onClick={handleSave}
					disabled={isSaving || !licenseInput.trim()}
					size="sm"
				>
					{isSaving ? "Saving..." : "Save"}
				</Button>
			</div>

			{hasExistingLicense && (
				<div className="flex">
					<Button
						variant="outline"
						onClick={onCancel}
						disabled={isSaving}
						size="sm"
					>
						Cancel
					</Button>
				</div>
			)}

			{message && (
				<LicenseMessage
					message={message}
					type={saveSuccess ? "success" : "error"}
					onDismiss={() => setMessage("")}
					autoDismiss={saveSuccess}
				/>
			)}
		</div>
	);
};

export default LicenseEditor;
