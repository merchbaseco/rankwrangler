import { useEffect } from "react";

interface LicenseMessageProps {
	message: string;
	type?: "success" | "error";
	onDismiss?: () => void;
	autoDismiss?: boolean;
	autoDismissDelay?: number;
}

export const LicenseMessage = ({
	message,
	type = "error",
	onDismiss,
	autoDismiss = false,
	autoDismissDelay = 3000,
}: LicenseMessageProps) => {
	useEffect(() => {
		if (autoDismiss && onDismiss) {
			const timer = setTimeout(onDismiss, autoDismissDelay);
			return () => clearTimeout(timer);
		}
	}, [autoDismiss, autoDismissDelay, onDismiss]);

	if (!message) {
		return null;
	}

	const isSuccess =
		type === "success" ||
		message.includes("success") ||
		message.includes("valid");

	return (
		<div
			className={`rounded p-2 text-sm ${
				isSuccess
					? "border border-green-200 bg-green-50 text-green-700"
					: "border border-red-200 bg-red-50 text-red-700"
			}`}
		>
			{message}
		</div>
	);
};
