import { Settings, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProductDisplay } from "@/scripts/content/components/product-display";
import Options from "@/scripts/options/options";
import type { Product } from "@/scripts/types/product";

const SEARCH_PRODUCT: Product = {
	asin: "B0D2YQ9ABC",
	marketplaceId: "ATVPDKIKX0DER",
	isMerchListing: null,
	isUnavailable: false,
	creationDate: "2025-07-11T00:00:00.000Z",
	rootCategoryBsr: 53_841,
	rootCategoryDisplayName: "Kitchen & Dining",
	metadata: {
		success: true,
		thumbnailStatus: "available",
	},
	freshness: { stale: false, updatedAt: "2026-02-25T11:23:00.000Z" },
};

const DETAIL_PRODUCT: Product = {
	...SEARCH_PRODUCT,
	freshness: { stale: true, updatedAt: "2026-01-25T11:23:00.000Z" },
};

export const ChromePreview = () => {
	const [debugMode, setDebugMode] = useState(false);

	return (
		<div className="min-h-screen bg-gradient-to-br from-orange-50 to-white p-6 text-foreground">
			<div className="mx-auto flex max-w-5xl flex-col gap-6">
				<header className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
					<h1 className="font-semibold text-2xl text-primary">
						RankWrangler Extension Preview
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Chrome Sync Host authentication and Amazon product surfaces.
					</p>
				</header>
				<section className="grid gap-6 lg:grid-cols-[340px_1fr]">
					<div className="space-y-3">
						<div className="rounded-3xl border border-white/60 bg-white/95 p-4 shadow-xl">
							<div className="flex items-center gap-2 pb-5">
								<ShieldCheck className="size-5 text-emerald-600" />
								<span className="font-semibold text-sm">Merchbase account</span>
							</div>
							<p className="text-muted-foreground text-xs">
								Sign in through the Clerk Sync Host. No API key is stored in the
								extension.
							</p>
							<Button className="mt-3 w-full" size="sm">
								Open account
							</Button>
							<div className="mt-4 flex items-center gap-2 border-t pt-3">
								<Settings className="size-4 text-primary" />
								<span className="font-medium text-xs">Debug mode</span>
								<Switch
									checked={debugMode}
									className="ml-auto"
									onCheckedChange={setDebugMode}
								/>
							</div>
						</div>
						<div className="rounded-xl border border-border bg-white p-4 shadow-sm">
							<Options />
						</div>
					</div>
					<div className="space-y-3">
						<h2 className="font-semibold text-lg">Content Surface</h2>
						<div className="rounded-xl border border-border bg-white p-4 shadow-sm">
							<h3 className="mb-3 font-semibold text-sm">Amazon result card</h3>
							<ProductDisplay mode="search" product={SEARCH_PRODUCT} />
						</div>
						<div className="rounded-xl border border-border bg-white p-4 shadow-sm">
							<h3 className="mb-3 font-semibold text-sm">Product detail</h3>
							<ProductDisplay
								mode="detail"
								onRefresh={() => undefined}
								product={DETAIL_PRODUCT}
							/>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
};
