import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LicenseEditorProps {
	onSave: (licenseKey: string) => void;
	onCancel: () => void;
	isSaving: boolean;
	hasExistingLicense: boolean;
}

const LicenseEditor = ({
	onSave,
	onCancel,
	isSaving,
	hasExistingLicense,
}: LicenseEditorProps) => {
	const [licenseInput, setLicenseInput] = useState("");

	const handleSave = () => {
		if (licenseInput.trim()) {
			onSave(licenseInput.trim());
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex gap-2">
				<Input
					placeholder="Enter license key..."
					value={licenseInput}
					onChange={(e) => setLicenseInput(e.target.value)}
					disabled={isSaving}
					type="password"
					className="text-sm"
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
		</div>
	);
};

export default LicenseEditor;
