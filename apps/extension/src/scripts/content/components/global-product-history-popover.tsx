import { useEffect, useRef, useState } from "react";
import type { ProductIdentifier } from "@/scripts/types/product";
import {
	PRODUCT_HISTORY_POPOVER_TOGGLE_EVENT,
	type ProductHistoryPopoverToggleDetail,
} from "../services/product-history-popover-events";
import { ProductHistorySection } from "./product-history-section";

const POPUP_WIDTH = 340;
const POPUP_GAP = 8;
const VIEWPORT_MARGIN = 8;

interface PopoverState {
	position: {
		left: number;
		top: number;
	};
	productIdentifier: ProductIdentifier;
}

export const GlobalProductHistoryPopover = () => {
	const [popoverState, setPopoverState] = useState<PopoverState | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const isOpen = popoverState != null;

	useEffect(() => {
		const handleToggle = (event: Event) => {
			const customEvent =
				event as CustomEvent<ProductHistoryPopoverToggleDetail>;
			const { productIdentifier, triggerRect } = customEvent.detail;
			const nextProductKey = `${productIdentifier.marketplaceId}:${productIdentifier.asin}`;

			setPopoverState((current) => {
				const currentProductKey = current
					? `${current.productIdentifier.marketplaceId}:${current.productIdentifier.asin}`
					: null;
				if (currentProductKey === nextProductKey) {
					return null;
				}

				return {
					position: resolvePopoverPosition(triggerRect),
					productIdentifier,
				};
			});
		};

		window.addEventListener(
			PRODUCT_HISTORY_POPOVER_TOGGLE_EVENT,
			handleToggle as EventListener
		);

		return () => {
			window.removeEventListener(
				PRODUCT_HISTORY_POPOVER_TOGGLE_EVENT,
				handleToggle as EventListener
			);
		};
	}, []);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			if (isEventInside(event, panelRef.current)) {
				return;
			}

			setPopoverState(null);
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setPopoverState(null);
			}
		};

		const handleViewportChange = () => {
			setPopoverState(null);
		};

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
	}, [isOpen]);

	if (!popoverState) {
		return null;
	}

	return (
		<div
			className="fixed z-[2147483647]"
			ref={panelRef}
			style={{
				left: `${popoverState.position.left}px`,
				top: `${popoverState.position.top}px`,
				width: `${POPUP_WIDTH}px`,
			}}
		>
			<ProductHistorySection
				compact={false}
				enabled={isOpen}
				productIdentifier={popoverState.productIdentifier}
				showChartHeader={false}
				showLastSync={false}
			/>
		</div>
	);
};

const resolvePopoverPosition = (
	triggerRect: ProductHistoryPopoverToggleDetail["triggerRect"]
) => {
	const top = triggerRect.bottom + POPUP_GAP;
	const maxLeft = window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN;
	const clampedLeft = Math.max(
		VIEWPORT_MARGIN,
		Math.min(triggerRect.left, Math.max(VIEWPORT_MARGIN, maxLeft))
	);

	return {
		left: clampedLeft,
		top,
	};
};

const isEventInside = (
	event: MouseEvent,
	element: HTMLElement | HTMLDivElement | null
) => {
	if (!element) {
		return false;
	}

	return event.composedPath().includes(element);
};
