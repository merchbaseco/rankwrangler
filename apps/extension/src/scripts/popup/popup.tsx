import { Separator } from "@/components/ui/separator";
import { CacheControls } from "./components/cache-controls";
import { DebugToggle } from "./components/debug-toggle";
import { Header } from "./components/header";
import { License } from "./components/license";

const Popup = () => {
	return (
		<div className="w-[340px] p-4 rounded-3xl border border-white/60 bg-white/95 backdrop-blur-lg supports-[backdrop-filter]:bg-white/90 shadow-xl">
			<Header />
			<div className="flex flex-col gap-3">
				<License />
				<CacheControls />
				<Separator />
				<DebugToggle />
			</div>
		</div>
	);
};

export default Popup;
