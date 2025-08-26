import { useEffect, useState } from "react";

const App = () => {
	const [isOpen, setIsOpen] = useState(false);

	const toggleIsOpen = () => {
		setIsOpen(!isOpen);
	};

	useEffect(() => {
		console.log("RankWrangler: Content script App.tsx loaded");
		setIsOpen(true);
		chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
			console.log(
				"RankWrangler: Message Received",
				request,
				sender,
				sendResponse,
			);
		});
	}, []);

	return (
		<>
			{isOpen && (
				<div className="fixed bottom-0 right-0 p-4 z-[9999]">
					<div className="inline-flex items-center justify-center h-16 rounded-full">
						<div className="inline-flex items-center justify-end p-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600">
							<div className="inline-flex flex-col self-stretch justify-center gap-2 px-4">
								<div className="font-normal leading-tight tracking-wider text-white text-sm">
									🚀 RankWrangler Content Script loaded!
									<br />
									Built with React + Tailwind
								</div>
							</div>
							<div className="inline-flex items-start self-stretch justify-start p-2 px-4 duration-200 bg-white rounded-full cursor-pointer hover:bg-gray-100">
								<div
									className="text-sm font-bold text-center text-black"
									onClick={toggleIsOpen}
								>
									✕
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default App;
