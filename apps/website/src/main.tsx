import { ClerkProvider, SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { DevAutoSignIn } from "./components/auth/dev-auto-sign-in";
import { ToastProvider } from "./components/ui/toast";
import { TRPCProvider } from "./lib/trpc-provider";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/syne/700.css";
import "@fontsource/syne/800.css";
import "./styles/global.css";

// Apply saved theme before first paint to prevent flash
const savedTheme = localStorage.getItem("rw-theme") ?? "system";
if (savedTheme === "dark" || (savedTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
	document.documentElement.classList.add("dark");
}

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

function MissingConfig() {
	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
				<div className="rounded-lg border bg-white p-6 shadow-sm">
					<h1 className="text-xl font-semibold">
						RankWrangler website misconfigured
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Missing{" "}
						<code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code>.
					</p>
					<p className="mt-2 text-sm text-muted-foreground">
						Fix: add it to{" "}
						<code className="font-mono">
							/Users/zknicker/srv/rankwrangler/.env
						</code>{" "}
						and redeploy.
					</p>
				</div>
			</div>
		</div>
	);
}

createRoot(rootElement).render(
	<StrictMode>
		{publishableKey ? (
			<ClerkProvider publishableKey={publishableKey}>
				<SignedIn>
					<TRPCProvider>
						<ToastProvider>
							<App />
						</ToastProvider>
					</TRPCProvider>
				</SignedIn>
				<SignedOut>
					<div className="flex min-h-screen items-center justify-center bg-background">
						<DevAutoSignIn />
						<SignIn />
					</div>
				</SignedOut>
			</ClerkProvider>
		) : (
			<MissingConfig />
		)}
	</StrictMode>,
);
