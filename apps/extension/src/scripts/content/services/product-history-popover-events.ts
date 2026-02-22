import type { ProductIdentifier } from "@/scripts/types/product";

export const PRODUCT_HISTORY_POPOVER_TOGGLE_EVENT =
	"rw:product-history-popover-toggle";

export interface ProductHistoryPopoverToggleDetail {
	productIdentifier: ProductIdentifier;
	triggerRect: {
		bottom: number;
		left: number;
		right: number;
		top: number;
	};
}

export const dispatchProductHistoryPopoverToggle = (
	detail: ProductHistoryPopoverToggleDetail
) => {
	window.dispatchEvent(
		new CustomEvent<ProductHistoryPopoverToggleDetail>(
			PRODUCT_HISTORY_POPOVER_TOGGLE_EVENT,
			{
				detail,
			}
		)
	);
};
