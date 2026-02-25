import "@/styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChromePreview } from "./chrome-preview";

const container = document.getElementById("preview-root");
const root = createRoot(container!);

root.render(
	<StrictMode>
		<ChromePreview />
	</StrictMode>
);
