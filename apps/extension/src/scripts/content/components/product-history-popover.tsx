import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductIdentifier } from "@/scripts/types/product";
import { ProductHistorySection } from "./product-history-section";

const POPUP_WIDTH = 340;
const POPUP_GAP = 8;
const VIEWPORT_MARGIN = 8;

export const ProductHistoryPopover = ({
	productIdentifier,
}: {
	productIdentifier: ProductIdentifier;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const updatePosition = useCallback(() => {
		if (!buttonRef.current) {
			return;
		}

		const rect = buttonRef.current.getBoundingClientRect();
		const top = rect.bottom + POPUP_GAP;
		const maxLeft = window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN;
		const clampedLeft = Math.max(
			VIEWPORT_MARGIN,
			Math.min(rect.left, Math.max(VIEWPORT_MARGIN, maxLeft))
		);

		setPosition({
			top,
			left: clampedLeft,
		});
	}, []);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		updatePosition();

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (
				buttonRef.current?.contains(target) ||
				panelRef.current?.contains(target)
			) {
				return;
			}

			setIsOpen(false);
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};

		const handleViewportChange = () => updatePosition();

		window.addEventListener("mousedown", handlePointerDown);
		window.addEventListener("keydown", handleEscape);
		window.addEventListener("scroll", handleViewportChange, true);
		window.addEventListener("resize", handleViewportChange);

		return () => {
			window.removeEventListener("mousedown", handlePointerDown);
			window.removeEventListener("keydown", handleEscape);
			window.removeEventListener("scroll", handleViewportChange, true);
			window.removeEventListener("resize", handleViewportChange);
		};
	}, [isOpen, updatePosition]);

	return (
		<>
			<div className="mt-1 flex w-full justify-end">
				<button
					className="cursor-pointer rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-medium text-[11px] text-gray-700 transition-colors hover:bg-gray-100"
					onClick={() => setIsOpen((previous) => !previous)}
					ref={buttonRef}
					type="button"
				>
					{isOpen ? "Hide graph" : "Show graph"}
				</button>
			</div>

			{isOpen ? (
				<div
					className="fixed z-[2147483647] rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
					ref={panelRef}
					style={{
						left: `${position.left}px`,
						top: `${position.top}px`,
						width: `${POPUP_WIDTH}px`,
					}}
				>
					<div className="flex items-center justify-between">
						<span className="font-semibold text-gray-900 text-xs">
							BSR History
						</span>
						<button
							className="cursor-pointer rounded px-1 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
							onClick={() => setIsOpen(false)}
							type="button"
						>
							Close
						</button>
					</div>

					<ProductHistorySection
						compact={false}
						enabled={isOpen}
						productIdentifier={productIdentifier}
					/>
				</div>
			) : null}
		</>
	);
};
