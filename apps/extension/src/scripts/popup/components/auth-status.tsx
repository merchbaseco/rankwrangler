import { useQuery } from "@tanstack/react-query";
import { ExternalLink, LogIn, ShieldCheck } from "lucide-react";
import { browser } from "webextension-polyfill-ts";
import { Button } from "@/components/ui/button";
import type { AuthStateResponse } from "@/scripts/content/types";

const readAuthState = async () => {
	const response = (await browser.runtime.sendMessage({
		type: "getAuthState",
	})) as AuthStateResponse;
	if (!(response.success && response.state)) {
		throw new Error(response.error ?? "Unable to read account state.");
	}
	return response.state;
};

export const AuthStatus = () => {
	const { data, isLoading, error } = useQuery({
		queryKey: ["extension-auth"],
		queryFn: readAuthState,
	});

	const openAccount = async () => {
		await browser.runtime.sendMessage({ type: "openAccount" });
	};

	return (
		<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div className="flex items-center gap-2 border-slate-100 border-b bg-slate-50 px-3 py-2">
				<ShieldCheck className="size-4 text-emerald-600" />
				<span className="font-semibold text-slate-600 text-xs uppercase tracking-wide">
					Merchbase account
				</span>
			</div>
			<div className="space-y-2 px-3 py-3">
				{isLoading ? (
					<p className="text-slate-500 text-xs">Checking account session…</p>
				) : null}
				{error ? <p className="text-red-600 text-xs">{error.message}</p> : null}
				{data?.status === "signed-in" ? (
					<>
						<p className="text-slate-600 text-xs">
							Signed in{data.email ? ` as ${data.email}` : ""}. RankWrangler
							requests use this session directly.
						</p>
						<Button
							className="h-7 w-full text-xs"
							onClick={openAccount}
							size="sm"
							variant="outline"
						>
							Manage account <ExternalLink className="size-3" />
						</Button>
					</>
				) : null}
				{data?.status === "signed-out" ? (
					<>
						<p className="text-slate-600 text-xs">
							Sign in through the Merchbase account page to enable RankWrangler.
						</p>
						<Button
							className="h-7 w-full text-xs"
							onClick={openAccount}
							size="sm"
						>
							<LogIn className="size-3" /> Sign in
						</Button>
					</>
				) : null}
				{data?.status === "denied" ? (
					<p className="text-red-600 text-xs">
						{data.error || "Account access is unavailable."}
					</p>
				) : null}
			</div>
		</div>
	);
};
