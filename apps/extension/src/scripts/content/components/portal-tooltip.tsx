import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PortalTooltipProps {
	children: React.ReactNode;
	content: React.ReactNode;
	show: boolean;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export const PortalTooltip = ({
	children,
	content,
	show,
	onMouseEnter,
	onMouseLeave,
}: PortalTooltipProps) => {
	const triggerRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ top: 0, left: 0 });

	// Calculate tooltip position when show state changes
	useEffect(() => {
		if (show && triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			const scrollTop =
				window.pageYOffset || document.documentElement.scrollTop;
			const scrollLeft =
				window.pageXOffset || document.documentElement.scrollLeft;

			// Position tooltip above the trigger element
			const top = rect.top + scrollTop - 10; // 10px gap above trigger
			const left = rect.left + scrollLeft;

			setPosition({ top, left });
		}
	}, [show]);

	return (
		<>
			{/* Trigger element */}
			<button
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
				ref={triggerRef}
				style={{
					background: "none",
					border: "none",
					padding: 0,
				}}
				type="button"
			>
				{children}
			</button>

			{/* Portal tooltip */}
			{show &&
				createPortal(
					<button
						onMouseEnter={onMouseEnter}
						onMouseLeave={onMouseLeave}
						style={{
							position: "absolute",
							top: position.top,
							left: position.left,
							zIndex: 9999,
							maxWidth: "300px",
							backgroundColor: "rgba(255, 255, 255, 0.95)",
							backdropFilter: "blur(4px)",
							border: "1px solid rgb(229, 231, 235)",
							borderRadius: "8px",
							padding: "8px 12px",
							boxShadow:
								"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
							fontSize: "12px",
							color: "rgb(55, 65, 81)",
							fontFamily: "system-ui, -apple-system, sans-serif",
							lineHeight: "1.4",
							transform: "translateY(-100%)", // Position above trigger
							pointerEvents: "auto",
							textAlign: "left",
						}}
						type="button"
					>
						{content}

						{/* Tooltip arrow */}
						<div
							style={{
								position: "absolute",
								bottom: "-4px",
								left: "16px",
								width: "8px",
								height: "8px",
								backgroundColor: "rgba(255, 255, 255, 0.95)",
								border: "1px solid rgb(229, 231, 235)",
								borderTop: "none",
								borderLeft: "none",
								borderRadius: "0 0 2px 0",
								transform: "rotate(45deg) translateX(-50%)",
								marginLeft: "4px",
							}}
						/>
					</button>,
					document.body
				)}
		</>
	);
};
