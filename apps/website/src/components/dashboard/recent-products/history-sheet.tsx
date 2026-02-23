import { ProductHistoryPanel } from '@/components/dashboard/product-history-panel';
import type { SelectedHistoryProduct } from '@/components/dashboard/recent-products/types';
import { Sheet, SheetPanel, SheetPopup } from '@/components/ui/sheet';

export const ProductHistorySheet = ({
	isOpen,
	selectedProduct,
	onOpenChange,
}: {
	isOpen: boolean;
	selectedProduct: SelectedHistoryProduct | null;
	onOpenChange: (open: boolean) => void;
}) => {
	const selectedKey = selectedProduct
		? `${selectedProduct.marketplaceId}:${selectedProduct.asin}`
		: null;

	return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetPopup side="right" variant="inset" className="p-0 sm:max-w-2xl">
                <SheetPanel className="h-full p-0">
                    {selectedProduct ? (
                        <ProductHistoryPanel
                            key={selectedKey}
                            product={selectedProduct}
                        />
                    ) : null}
                </SheetPanel>
            </SheetPopup>
        </Sheet>
	);
};
