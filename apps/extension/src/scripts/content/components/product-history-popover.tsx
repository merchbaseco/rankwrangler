import { LineChart } from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ProductIdentifier } from "@/scripts/types/product";
import { dispatchProductHistoryPopoverToggle } from "../services/product-history-popover-events";
import { ProductHistorySection } from "./product-history-section";

const TARGET_POPUP_WIDTH = 920;
const POPUP_GAP = 8;
const VIEWPORT_MARGIN = 8;

export const ProductHistoryPopover = ({
	className,
	globalHost = false,
	productIdentifier,
}: {
	className?: string;
	globalHost?: boolean;
	productIdentifier: ProductIdentifier;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [position, setPosition] = useState({
		top: 0,
		left: 0,
		width: TARGET_POPUP_WIDTH,
	});
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const updatePosition = useCallback(() => {
		if (!buttonRef.current) {
			return;
		}

		const rect = buttonRef.current.getBoundingClientRect();
		const width = resolvePopoverWidth();
		const top = rect.bottom + POPUP_GAP;
		const triggerCenterX = (rect.left + rect.right) / 2;
		const idealLeft = triggerCenterX - width / 2;
		const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
		const clampedLeft = Math.max(
			VIEWPORT_MARGIN,
			Math.min(idealLeft, Math.max(VIEWPORT_MARGIN, maxLeft))
		);

		setPosition({
			width,
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
			if (isEventInside(event, buttonRef.current)) {
				return;
			}

			if (isEventInside(event, panelRef.current)) {
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

	const triggerTitle = isOpen ? "Hide graph" : "Show graph";
	const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		if (globalHost) {
			const rect = event.currentTarget.getBoundingClientRect();
			dispatchProductHistoryPopoverToggle({
				productIdentifier,
				triggerRect: {
					bottom: rect.bottom,
					left: rect.left,
					right: rect.right,
					top: rect.top,
				},
			});
			return;
		}

		setIsOpen((previous) => !previous);
	};
	const handleTriggerMouseDown = (
		event: ReactMouseEvent<HTMLButtonElement>
	) => {
		event.preventDefault();
		event.stopPropagation();
	};
	const handleTriggerPointerDown = (
		event: ReactPointerEvent<HTMLButtonElement>
	) => {
		event.preventDefault();
		event.stopPropagation();
	};
	const triggerAriaExpanded = globalHost ? undefined : isOpen;

	return (
		<>
			<button
				aria-expanded={triggerAriaExpanded}
				aria-label={triggerTitle}
				className={
					className ??
					"cursor-pointer rounded bg-transparent px-1 py-0.5 text-gray-500 transition-all duration-200 hover:bg-gray-200 hover:text-gray-800"
				}
				onClick={handleToggle}
				onMouseDown={handleTriggerMouseDown}
				onPointerDown={handleTriggerPointerDown}
				ref={buttonRef}
				title={triggerTitle}
				type="button"
			>
				<LineChart className="h-3.5 w-3.5" />
			</button>

			{!globalHost && isOpen ? (
				<div
					className="fixed z-[2147483647] max-h-[calc(100vh-24px)] overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
					ref={panelRef}
					style={{
						left: `${position.left}px`,
						top: `${position.top}px`,
						width: `${position.width}px`,
					}}
				>
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

const isEventInside = (
	event: MouseEvent,
	element: HTMLElement | HTMLDivElement | null
) => {
	if (!element) {
		return false;
	}

	const path = event.composedPath();
	return path.includes(element);
};

const resolvePopoverWidth = () => {
	const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2);
	if (availableWidth < 320) {
		return availableWidth;
	}

	return Math.min(TARGET_POPUP_WIDTH, availableWidth);
};
