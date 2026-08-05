import { useCallback } from "react";
import type { MouseEvent } from "react";
import {
	CursorImageTooltip,
	useCursorImageTooltip,
} from "@/components/ui/tooltip";

export type ProductRowMouseEnter = {
	event: MouseEvent<HTMLTableRowElement>;
	imageUrl: string | null;
	title: string | null;
	asin: string;
};

export type ProductRowMouseMove = Pick<
	ProductRowMouseEnter,
	"event" | "imageUrl"
>;

export const useProductImageTooltip = () => {
	const {
		hideTooltip,
		queueTooltipPositionUpdate,
		setTooltip,
		tooltip,
		tooltipRef,
	} = useCursorImageTooltip();

	const onRowMouseEnter = useCallback(
		({ event, imageUrl, title, asin }: ProductRowMouseEnter) => {
			if (!imageUrl) {
				hideTooltip();
				return;
			}
			queueTooltipPositionUpdate(event.clientX, event.clientY);
			setTooltip({ url: imageUrl, title: title ?? asin });
		},
		[hideTooltip, queueTooltipPositionUpdate, setTooltip],
	);

	const onRowMouseMove = useCallback(
		({ event, imageUrl }: ProductRowMouseMove) => {
			if (!imageUrl) {
				hideTooltip();
				return;
			}
			queueTooltipPositionUpdate(event.clientX, event.clientY);
		},
		[hideTooltip, queueTooltipPositionUpdate],
	);

	return {
		onRowMouseEnter,
		onRowMouseLeave: hideTooltip,
		onRowMouseMove,
		tooltip,
		tooltipRef,
	};
};

export const ProductImageTooltip = ({
	tooltip,
	tooltipRef,
}: Pick<ReturnType<typeof useCursorImageTooltip>, "tooltip" | "tooltipRef">) => (
	<CursorImageTooltip tooltip={tooltip} tooltipRef={tooltipRef} />
);
