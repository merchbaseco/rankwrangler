import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/index.css";

const OnInstalled = () => {
	return (
		<div>
			<h1>Thanks for Installing!</h1>
		</div>
	);
};

const container = document.getElementById("onInstalled");
const root = createRoot(container!);

root.render(
	<StrictMode>
		<OnInstalled />
	</StrictMode>,
);
