import "@/styles/index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "../content/services/query-client";
import { ChromePreview } from "./chrome-preview";

const container = document.getElementById("preview-root");
const root = createRoot(container!);

root.render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<ChromePreview />
		</QueryClientProvider>
	</StrictMode>
);
