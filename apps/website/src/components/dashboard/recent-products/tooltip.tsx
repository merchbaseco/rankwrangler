import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_WIDTH = 208;
const TOOLTIP_HEIGHT = 248;
const TOOLTIP_OFFSET = 14;

type TooltipState = {
	url: string;
	title: string;
};

export const useProductTooltip = () => {
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const tooltipFrameRef = useRef<number | null>(null);
	const tooltipCursorRef = useRef({ x: 0, y: 0 });

	const applyTooltipPosition = useCallback(() => {
		const node = tooltipRef.current;
		if (!node) {
			return;
		}

		const { x, y } = tooltipCursorRef.current;
		const position = getTooltipPosition({ cursorX: x, cursorY: y });
		node.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
	}, []);

	const queueTooltipPositionUpdate = useCallback(
		(cursorX: number, cursorY: number) => {
			tooltipCursorRef.current = { x: cursorX, y: cursorY };

			if (tooltipFrameRef.current !== null) {
				return;
			}

			tooltipFrameRef.current = window.requestAnimationFrame(() => {
				tooltipFrameRef.current = null;
				applyTooltipPosition();
			});
		},
		[applyTooltipPosition],
	);

	const hideTooltip = useCallback(() => {
		if (tooltipFrameRef.current !== null) {
			window.cancelAnimationFrame(tooltipFrameRef.current);
			tooltipFrameRef.current = null;
		}
		setTooltip(null);
	}, []);

	useEffect(() => {
		if (!tooltip) {
			return;
		}
		applyTooltipPosition();
	}, [applyTooltipPosition, tooltip]);

	useEffect(() => {
		return () => {
			if (tooltipFrameRef.current !== null) {
				window.cancelAnimationFrame(tooltipFrameRef.current);
			}
		};
	}, []);

	return {
		hideTooltip,
		queueTooltipPositionUpdate,
		setTooltip,
		tooltip,
		tooltipRef,
	};
};

export const ProductTooltipPortal = ({
	tooltip,
	tooltipRef,
}: {
	tooltip: TooltipState | null;
	tooltipRef: React.RefObject<HTMLDivElement | null>;
}) => {
	if (!tooltip) {
		return null;
	}

	return createPortal(
		<div
			ref={tooltipRef}
			className="pointer-events-none fixed left-0 top-0 z-50 overflow-hidden rounded-sm border border-border bg-card shadow-md will-change-transform"
		>
			<img src={tooltip.url} alt={tooltip.title} className="block w-[188px]" />
		</div>,
		document.body,
	);
};

const getTooltipPosition = ({
	cursorX,
	cursorY,
}: {
	cursorX: number;
	cursorY: number;
}) => {
	const left =
		cursorX + TOOLTIP_WIDTH > window.innerWidth
			? cursorX - TOOLTIP_WIDTH
			: cursorX + TOOLTIP_OFFSET;
	const top =
		cursorY + TOOLTIP_HEIGHT > window.innerHeight
			? cursorY - TOOLTIP_HEIGHT
			: cursorY + TOOLTIP_OFFSET;
	return { left, top };
};
