import { StrictMode } from "react";
import "@/styles/index.css";
import { createRoot } from "react-dom/client";
import Options from "./Options";

const container = document.getElementById("options-root");
const root = createRoot(container!);

root.render(
	<StrictMode>
		<Options />
	</StrictMode>,
);
