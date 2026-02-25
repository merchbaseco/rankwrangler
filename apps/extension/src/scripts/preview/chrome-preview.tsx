import { Settings } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ProductDisplay } from "@/scripts/content/components/product-display";
import { ProductHistoryChart } from "@/scripts/content/components/product-history-chart";
import type { ChartPoint } from "@/scripts/content/hooks/use-product-history";
import Options from "@/scripts/options/options";
import LicenseInfo from "@/scripts/popup/components/license-info";
import { LicenseMessage } from "@/scripts/popup/components/license-message";
import { LicenseStatusBadge } from "@/scripts/popup/components/license-status-badge";
import type { License } from "@/scripts/types/license";
import type { Product } from "@/scripts/types/product";

type PopupPreviewState = "loading" | "active" | "invalid" | "inactive";

const POPUP_PREVIEW_STATES: { label: string; value: PopupPreviewState }[] = [
	{ label: "Loading", value: "loading" },
	{ label: "Active", value: "active" },
	{ label: "Invalid", value: "invalid" },
	{ label: "Inactive", value: "inactive" },
];

const ACTIVE_LICENSE: License = {
	key: "RWL-8QW2-ABCD-9JKL",
	email: "you@example.com",
	isValid: true,
	lastValidated: Date.now(),
	usage: 1423,
	usageLimit: 5000,
};

const INVALID_LICENSE: License = {
	key: "RWL-1234-EXPIRED-9999",
	email: "you@example.com",
	isValid: false,
	lastValidated: Date.now(),
	usage: 5000,
	usageLimit: 5000,
};

const SEARCH_PRODUCT: Product = {
	asin: "B0D2YQ9ABC",
	marketplaceId: "ATVPDKIKX0DER",
	creationDate: "2025-07-11T00:00:00.000Z",
	rootCategoryBsr: 53_841,
	rootCategoryDisplayName: "Kitchen & Dining",
	metadata: {
		success: true,
		cached: true,
		lastFetched: "2026-02-25T11:23:00.000Z",
	},
};

const NO_RANK_PRODUCT: Product = {
	...SEARCH_PRODUCT,
	rootCategoryBsr: null,
	rootCategoryDisplayName: null,
};

export const ChromePreview = () => {
	const [popupState, setPopupState] = useState<PopupPreviewState>("active");
	const [debugMode, setDebugMode] = useState(false);
	const chartPoints = useMemo(() => buildPreviewChartPoints(), []);
	const previewLicense = getPreviewLicense(popupState);

	return (
		<div className="min-h-screen bg-gradient-to-br from-orange-50 to-white p-6 text-foreground">
			<div className="mx-auto flex max-w-7xl flex-col gap-6">
				<header className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
					<h1 className="font-semibold text-2xl text-primary">
						RankWrangler Extension Preview
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Local UI sandbox for popup, content badges, chart states, options,
						and install page.
					</p>
				</header>

				<section className="grid gap-6 lg:grid-cols-[380px_1fr]">
					<div className="space-y-3">
						<h2 className="font-semibold text-lg">Popup Surface</h2>
						<div className="flex flex-wrap gap-2">
							{POPUP_PREVIEW_STATES.map((state) => (
								<Button
									key={state.value}
									onClick={() => setPopupState(state.value)}
									size="sm"
									variant={popupState === state.value ? "default" : "outline"}
								>
									{state.label}
								</Button>
							))}
						</div>
						<div className="w-[340px] rounded-3xl border border-white/60 bg-white/95 p-4 shadow-xl backdrop-blur-lg supports-[backdrop-filter]:bg-white/90">
							<PopupHeader />
							<div className="flex flex-col gap-3">
								<PopupLicensePreview
									license={previewLicense}
									popupState={popupState}
								/>
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="font-medium text-sm">Cache</span>
										<Button size="sm" variant="outline">
											Clear Cache
										</Button>
									</div>
									<p className="text-muted-foreground text-xs">
										Cache cleared.
									</p>
								</div>
								<Separator />
								<div className="group flex w-full items-center gap-1.5">
									<Settings className="size-5 text-primary transition-transform duration-300 group-hover:rotate-90" />
									<div className="font-medium text-sm">Debug Mode</div>
									<Switch
										checked={debugMode}
										className="ml-auto"
										onCheckedChange={setDebugMode}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="space-y-4">
						<h2 className="font-semibold text-lg">Options Surface</h2>
						<div className="rounded-xl border border-border bg-white p-5 shadow-sm">
							<Options />
						</div>
					</div>
				</section>

				<section className="space-y-3">
					<h2 className="font-semibold text-lg">Content Surfaces</h2>
					<div className="grid gap-4 lg:grid-cols-2">
						<PreviewCard title="Search Badge (Loaded)">
							<ProductDisplay mode="search" product={SEARCH_PRODUCT} />
						</PreviewCard>
						<PreviewCard title="Search Badge (No Rank Data)">
							<ProductDisplay mode="search" product={NO_RANK_PRODUCT} />
						</PreviewCard>
						<PreviewCard title="Search Badge (Loading)">
							<ProductDisplay
								isLoading={true}
								mode="search"
								product={SEARCH_PRODUCT}
							/>
						</PreviewCard>
						<PreviewCard title="Search Badge (Error)">
							<ProductDisplay
								isError={true}
								mode="search"
								product={SEARCH_PRODUCT}
							/>
						</PreviewCard>
					</div>
				</section>

				<section className="space-y-3">
					<h2 className="font-semibold text-lg">History Chart Surface</h2>
					<div className="rounded-xl border border-border bg-white p-4 shadow-sm">
						<ProductHistoryChart
							chartId="preview-bsr-history"
							collecting={false}
							error={null}
							isLoading={false}
							points={chartPoints}
						/>
					</div>
				</section>

				<section className="space-y-3">
					<h2 className="font-semibold text-lg">Install Surface</h2>
					<div className="rounded-xl border border-border bg-white p-5 shadow-sm">
						<h3 className="font-semibold text-lg text-primary">
							Thanks for Installing!
						</h3>
						<p className="mt-2 text-muted-foreground text-sm">
							This mirrors the extension install page shell so copy and layout
							changes can be previewed quickly.
						</p>
					</div>
				</section>
			</div>
		</div>
	);
};

const PopupHeader = () => {
	return (
		<div className="flex gap-3 pb-8">
			<div className="shrink-0">
				<div className="aspect-square rounded-lg border border-orange-200 bg-gradient-to-b from-orange-100 to-orange-200 p-[3px] shadow-sm">
					<img
						alt="RankWrangler"
						className="size-8 object-contain"
						height={32}
						src="/assets/icon.png"
						width={32}
					/>
				</div>
			</div>
			<div>
				<div className="-mt-0.5 font-bold text-base text-primary tracking-tighter">
					Rank Wrangler
				</div>
				<div className="text-secondary text-xs tracking-tight">
					Previewing popup states locally
				</div>
			</div>
		</div>
	);
};

const PopupLicensePreview = ({
	license,
	popupState,
}: {
	license?: License;
	popupState: PopupPreviewState;
}) => {
	if (popupState === "loading") {
		return (
			<div className="flex flex-col items-center justify-center space-y-3 py-8">
				<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
				<div className="text-muted-foreground text-sm">
					Syncing license status...
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm">License Status</span>
				<LicenseStatusBadge license={license} />
			</div>
			{license ? <LicenseInfo license={license} /> : null}
			{popupState === "inactive" ? (
				<div className="space-y-2">
					<div className="flex gap-2">
						<Input placeholder="Enter license key..." type="password" />
						<Button size="sm">Save</Button>
					</div>
					<LicenseMessage message="Please enter a valid license key" />
				</div>
			) : (
				<div className="flex w-full">
					<Button className="grow" size="sm" variant="outline">
						Edit License
					</Button>
				</div>
			)}
		</div>
	);
};

const PreviewCard = ({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) => {
	return (
		<div className="rounded-xl border border-border bg-white p-4 shadow-sm">
			<p className="mb-3 font-medium text-muted-foreground text-sm">{title}</p>
			{children}
		</div>
	);
};

const buildPreviewChartPoints = (): ChartPoint[] => {
	const now = Date.now();
	const points: ChartPoint[] = [];
	const dayMs = 24 * 60 * 60 * 1000;

	for (let dayOffset = 89; dayOffset >= 0; dayOffset -= 1) {
		const timestamp = now - dayOffset * dayMs;
		const trend = 62_000 - (89 - dayOffset) * 320;
		const variation = Math.sin(dayOffset / 4) * 2100;
		points.push({
			timestamp,
			value: Math.max(5000, Math.round(trend + variation)),
		});
	}

	return points;
};

const getPreviewLicense = (
	popupState: PopupPreviewState
): License | undefined => {
	if (popupState === "active") {
		return ACTIVE_LICENSE;
	}

	if (popupState === "invalid") {
		return INVALID_LICENSE;
	}

	return undefined;
};
