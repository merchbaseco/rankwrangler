import clipboard from "clipboardy";
import { formatDistanceToNow } from "date-fns";
import { Box, render, Text, useApp, useInput, useStdout } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

// import Divider from 'ink-divider'; // Has build issues with Vite
// import { Badge, StatusMessage } from '@inkjs/ui'; // Causing issues, will revisit later

// Simple API client
class SimpleAPIClient {
	private baseUrl = "https://merchbase.co/api";
	private adminKey =
		"2d94ee23d7dcebc15412be11735ae0b0f8dcf3ba0eccb12cb310c7c49548fb06";

	async get(endpoint: string, params: Record<string, any> = {}) {
		const queryParams = new URLSearchParams({
			adminKey: this.adminKey,
			...params,
		});

		const response = await fetch(`${this.baseUrl}${endpoint}?${queryParams}`);
		// Return server response directly (server already provides success/error structure)
		return await response.json();
	}

	async post(endpoint: string, body: Record<string, any> = {}) {
		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				adminKey: this.adminKey,
				...body,
			}),
		});

		// Return server response directly (server already provides success/error structure)
		return await response.json();
	}

	async getLicenseStats() {
		return this.get("/admin/license/stats");
	}

	async getLicenses() {
		return this.get("/admin/license/list");
	}

	async createLicense(email: string, expirationDays: number = 30) {
		return this.post("/admin/license/generate", {
			email,
			expiryDays: expirationDays,
		});
	}
}

const api = new SimpleAPIClient();

// Breadcrumb Component
const Breadcrumb: React.FC<{ path: string[] }> = ({ path }) => {
	return (
		<Box>
			{path.map((item, index) => (
				<Box key={index} flexDirection="row">
					{index > 0 && (
						<Text color="gray" dimColor>
							{" › "}
						</Text>
					)}
					<Text
						bold={index === path.length - 1}
						color={index === path.length - 1 ? "white" : "gray"}
						dimColor={index !== path.length - 1}
					>
						{item}
					</Text>
				</Box>
			))}
		</Box>
	);
};

// Simple Dashboard Component
const Dashboard: React.FC = () => {
	const { stdout } = useStdout();
	const [stats, setStats] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");

	// Calculate responsive dimensions
	const terminalWidth = stdout.columns;
	const halfWidth = Math.floor((terminalWidth - 6) / 2); // Space for 2 boxes side by side

	useEffect(() => {
		// Initial load
		api.getLicenseStats().then((result) => {
			if (result.success) {
				setStats(result.data);
			} else {
				setError(result.error || "Failed to load stats");
			}
			setLoading(false);
		});

		// Set up auto-refresh every 10 seconds
		const intervalId = setInterval(() => {
			api.getLicenseStats().then((result) => {
				if (result.success) {
					setStats(result.data);
					setError(""); // Clear any previous errors
				}
				// Don't set loading state for background refreshes
			});
		}, 10000); // 10 seconds

		// Cleanup interval on component unmount
		return () => clearInterval(intervalId);
	}, []);

	if (loading) {
		return (
			<Box justifyContent="center" marginY={2}>
				<Text color="cyan">
					<Spinner type="dots" /> Loading dashboard...
				</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" alignItems="center" marginY={2}>
				<Text color="red">❌ Error: {error}</Text>
				<Text color="gray">Check your connection and try again</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Header with BigText and Gradient */}
			<Box flexDirection="column" marginBottom={2}>
				<Gradient name="pastel">
					<BigText text="RANKWRANGLER" font="block" />
				</Gradient>

				<Breadcrumb path={["License Management CLI"]} />
			</Box>

			<Box flexDirection="row" marginY={1} columnGap={2}>
				{/* Consolidated Stats Box */}
				<Box
					borderStyle="single"
					borderColor="cyan"
					padding={1}
					width={halfWidth}
				>
					<Box flexDirection="column">
						<Text bold color="cyan">
							📊 License Overview
						</Text>
						<Text color="gray">
							• Total:{" "}
							<Text bold color="cyan">
								{stats?.total || 0}
							</Text>
						</Text>
						<Text color="gray">
							• Active:{" "}
							<Text bold color="green">
								{stats?.active || 0}
							</Text>
						</Text>
						<Text color="gray">
							• Expired:{" "}
							<Text bold color="red">
								{stats?.expired || 0}
							</Text>
						</Text>
					</Box>
				</Box>

				{/* Activity Status Box */}
				<Box
					borderStyle="single"
					borderColor="cyan"
					padding={1}
					width={halfWidth}
				>
					<Box flexDirection="column">
						<Text bold color="cyan">
							📈 Activity Status
						</Text>
						<Text color="gray">
							• Products cached: {stats?.productsInCache || 0}
						</Text>
						<Text color="gray">
							• SP-API calls: {stats?.recentApiCalls || 0}
						</Text>
						<Text color="gray">• System status: All services operational</Text>
						<Text color="gray">
							• Last updated: {new Date().toLocaleTimeString()}
						</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
};

// Create License Component
const CreateLicense: React.FC<{
	onBack: () => void;
	onSuccess: (message: string) => void;
}> = ({ onBack, onSuccess }) => {
	const [email, setEmail] = useState("");
	const [selectedExpiration, setSelectedExpiration] = useState(0);
	const [customDays, setCustomDays] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState("");
	const [step, setStep] = useState<"email" | "expiration" | "custom">("email");

	const expirationOptions = [
		{ label: "30 days", days: 30 },
		{ label: "90 days", days: 90 },
		{ label: "1 year", days: 365 },
		{ label: "Custom", days: -1 },
	];

	const validateEmail = (email: string) => {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	};

	const createLicense = async () => {
		console.log("=== CREATE LICENSE CALLED ===");
		console.log("Email:", email);
		console.log("Selected expiration:", selectedExpiration);
		console.log("Custom days:", customDays);

		if (!validateEmail(email)) {
			console.log("❌ Email validation failed");
			setError("Please enter a valid email address");
			return;
		}

		const days =
			selectedExpiration === 3
				? parseInt(customDays)
				: expirationOptions[selectedExpiration].days;
		console.log("Calculated days:", days);

		if (selectedExpiration === 3 && (isNaN(days) || days < 1 || days > 3650)) {
			console.log("❌ Custom days validation failed");
			setError("Custom days must be between 1 and 3650");
			return;
		}

		console.log("🔄 Starting license creation...");
		setIsCreating(true);
		setError("");

		try {
			console.log("📡 Calling API with:", { email, days });
			const result = await api.createLicense(email, days);
			console.log("📡 API Response:", result);

			if (result.success) {
				console.log("✅ License created successfully!");
				onSuccess("✅ License created successfully!");
			} else {
				console.log("❌ API Error:", result.error);
				setError(result.error || "Failed to create license");
				setIsCreating(false);
			}
		} catch (err) {
			console.error("❌ Network/Catch Error:", err);
			setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
			setIsCreating(false);
		}
	};

	useInput((input, key) => {
		// Always allow escape to go back
		if (key.escape && !isCreating) {
			onBack();
			return;
		}

		// Prevent any input while creating
		if (isCreating) {
			return;
		}

		if (step === "expiration") {
			if (key.upArrow || input === "k") {
				setSelectedExpiration((prev) => Math.max(0, prev - 1));
			}
			if (key.downArrow || input === "j") {
				setSelectedExpiration((prev) =>
					Math.min(expirationOptions.length - 1, prev + 1),
				);
			}
			if (key.return) {
				console.log("⚡ Return key pressed in expiration step");
				console.log("Selected expiration index:", selectedExpiration);
				if (selectedExpiration === 3) {
					console.log("🔄 Moving to custom step");
					setStep("custom");
				} else {
					console.log("🚀 Calling createLicense()");
					createLicense();
				}
			}
			if (key.leftArrow || input === "h") {
				setStep("email");
			}
		}

		if (step === "email" && key.return && email.trim()) {
			setStep("expiration");
		}

		if (step === "custom" && key.return && customDays.trim()) {
			createLicense();
		}
	});

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Header */}
			<Box flexDirection="column" marginBottom={2}>
				<Gradient name="pastel">
					<BigText text="RANKWRANGLER" font="block" />
				</Gradient>

				<Breadcrumb path={["License Management CLI", "Licenses", "Create New License"]} />
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">❌ {error}</Text>
				</Box>
			)}

			<Box flexDirection="column" marginY={1}>
				{/* Email Step */}
				<Box marginBottom={1}>
					<Text bold color={step === "email" ? "cyan" : "gray"}>
						1. Email Address:
					</Text>
				</Box>
				<Box marginBottom={2}>
					{step === "email" ? (
						<TextInput
							value={email}
							onChange={setEmail}
							placeholder="Enter email address..."
						/>
					) : (
						<Text color="green">📧 {email}</Text>
					)}
				</Box>

				{/* Expiration Step */}
				{(step === "expiration" || step === "custom") && (
					<>
						<Box marginBottom={1}>
							<Text bold color={step === "expiration" ? "cyan" : "gray"}>
								2. License Duration:
							</Text>
						</Box>
						{step === "expiration" ? (
							<Box flexDirection="column" marginBottom={2}>
								{expirationOptions.map((option, index) => (
									<Text
										key={index}
										color={selectedExpiration === index ? "cyan" : "gray"}
										backgroundColor={
											selectedExpiration === index ? "cyan" : undefined
										}
									>
										{selectedExpiration === index ? "► " : "  "}
										{option.label}
									</Text>
								))}
							</Box>
						) : (
							<Box marginBottom={2}>
								<Text color="green">
									⏱️ {expirationOptions[selectedExpiration].label}
								</Text>
							</Box>
						)}
					</>
				)}

				{/* Custom Days Step */}
				{step === "custom" && (
					<>
						<Box marginBottom={1}>
							<Text bold color="cyan">
								Enter custom days (1-3650):
							</Text>
						</Box>
						<Box marginBottom={2}>
							<TextInput
								value={customDays}
								onChange={setCustomDays}
								placeholder="Enter number of days..."
							/>
						</Box>
					</>
				)}
			</Box>

			{isCreating && (
				<Box marginY={1}>
					<Text color="cyan">
						<Spinner type="dots" /> Creating license...
					</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="yellow">
					{step === "email" && "Press [Enter] to continue • [Esc] to cancel"}
					{step === "expiration" &&
						"Use [↑/↓] to select • [Enter] to confirm • [←] to go back • [Esc] to cancel"}
					{step === "custom" &&
						"Enter days and press [Enter] • [Esc] to cancel"}
				</Text>
			</Box>
		</Box>
	);
};

// Simple Licenses Component
const Licenses: React.FC<{
	onBack: () => void;
	onCreateLicense: () => void;
	refreshTrigger?: number;
	successMessage?: string;
}> = ({ onBack, onCreateLicense, refreshTrigger, successMessage }) => {
	const { stdout } = useStdout();
	const [licenses, setLicenses] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [message, setMessage] = useState("");
	
	const itemsPerPage = 10;
	const [currentPage, setCurrentPage] = useState(0);

	const loadLicenses = useCallback(async () => {
		setLoading(true);
		const result = await api.getLicenses();
		
		if (result.success) {
			const licenseData = result.data;
			
			if (Array.isArray(licenseData)) {
				setLicenses(licenseData);
			} else if (
				licenseData?.licenses &&
				Array.isArray(licenseData.licenses)
			) {
				setLicenses(licenseData.licenses);
			} else {
				setLicenses([]);
			}
		} else {
			setLicenses([]);
		}
		setLoading(false);
	}, []);

	// Calculate responsive dimensions
	const terminalWidth = stdout.columns;
	const maxEmailWidth = Math.floor(terminalWidth * 0.6); // 60% for email
	const maxTimeWidth = Math.floor(terminalWidth * 0.3); // 30% for time

	useEffect(() => {
		loadLicenses();
	}, [loadLicenses, refreshTrigger]);

	const filteredLicenses = licenses.filter(
		(license) =>
			license.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			license.id?.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	// Pagination logic
	const totalPages = Math.ceil(filteredLicenses.length / itemsPerPage);
	const startIndex = currentPage * itemsPerPage;
	const endIndex = startIndex + itemsPerPage;
	const currentPageLicenses = filteredLicenses.slice(startIndex, endIndex);
	
	// Reset pagination when search changes
	useEffect(() => {
		setCurrentPage(0);
		setSelectedIndex(0);
	}, [searchQuery]);

	// Handle success message from license creation
	useEffect(() => {
		if (successMessage) {
			showMessage(successMessage);
		}
	}, [successMessage]);

	const showMessage = (msg: string) => {
		setMessage(msg);
		setTimeout(() => setMessage(""), 3000);
	};

	// Helper function to truncate text
	const truncateText = (text: string, maxWidth: number) => {
		if (text.length <= maxWidth - 3) return text;
		return text.substring(0, maxWidth - 3) + "...";
	};

	useInput((input, key) => {
		// When in search mode, only handle Escape to exit search
		if (isSearching) {
			if (key.escape) {
				setIsSearching(false);
			}
			return; // Don't handle other keys when searching
		}

		// Normal navigation when not in search mode
		if (key.escape || input === "b") {
			onBack();
		}

		if (input === "s") {
			setIsSearching(true);
		}

		if (input === "n") {
			onCreateLicense();
		}

		if (input === "c") {
			const license = currentPageLicenses[selectedIndex];
			if (license?.key) {
				clipboard.writeSync(license.key);
				showMessage("✅ License key copied to clipboard");
			}
		}

		if (key.upArrow || input === "k") {
			setSelectedIndex((prev) => {
				if (prev > 0) {
					return prev - 1;
				} else if (currentPage > 0) {
					// Go to previous page, select last item
					setCurrentPage(currentPage - 1);
					return itemsPerPage - 1;
				}
				return 0;
			});
		}

		if (key.downArrow || input === "j") {
			setSelectedIndex((prev) => {
				if (prev < currentPageLicenses.length - 1) {
					return prev + 1;
				} else if (currentPage < totalPages - 1) {
					// Go to next page, select first item
					setCurrentPage(currentPage + 1);
					return 0;
				}
				return prev;
			});
		}
	});

	if (loading) {
		return (
			<Box justifyContent="center" marginY={2}>
				<Text color="cyan">
					<Spinner type="dots" /> Loading licenses...
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Header with BigText and Gradient */}
			<Box flexDirection="column" marginBottom={2}>
				<Gradient name="pastel">
					<BigText text="RANKWRANGLER" font="block" />
				</Gradient>

				<Breadcrumb path={["License Management CLI", "Licenses"]} />
			</Box>

			{/* Always reserve space for status messages */}
			<Box marginBottom={1} height={1}>
				{message ? (
					<Text color="green">{message}</Text>
				) : (
					<Text> </Text>
				)}
			</Box>

			<Box marginBottom={1} flexDirection="row">
				<Text color="gray">Search: </Text>
				{isSearching ? (
					<TextInput
						value={searchQuery}
						onChange={setSearchQuery}
						placeholder="Type to search..."
						onSubmit={() => setIsSearching(false)}
					/>
				) : (
					<Text color={searchQuery ? "white" : "gray"}>
						{searchQuery || "(none) - Press [s] to search"}
					</Text>
				)}
			</Box>

			<Box borderStyle="single" borderColor="cyan" padding={1}>
				{filteredLicenses.length === 0 ? (
					<Text color="gray">No licenses found</Text>
				) : (
					<Box flexDirection="column">
						{/* Render actual license rows */}
						{currentPageLicenses.map((license, index) => {
							const isSelected = index === selectedIndex;
							const isExpired =
								license.expiresAt && new Date(license.expiresAt) < new Date();

							return (
								<Box
									key={license.id || index}
									backgroundColor={isSelected ? "cyan" : undefined}
									paddingX={1}
								>
									<Box width="100%" justifyContent="space-between">
										<Text
											color={isSelected ? "black" : isExpired ? "red" : "green"}
											bold
										>
											📧{" "}
											{truncateText(license.email || "No email", maxEmailWidth)}
										</Text>
										<Text color={isSelected ? "black" : "gray"}>
											{truncateText(
												license.expiresAt
													? formatDistanceToNow(new Date(license.expiresAt), {
															addSuffix: true,
														})
													: "No expiry",
												maxTimeWidth,
											)}
										</Text>
									</Box>
								</Box>
							);
						})}
						
						{/* Fill remaining space with empty rows to maintain consistent height */}
						{Array.from({ length: itemsPerPage - currentPageLicenses.length }).map((_, index) => (
							<Box key={`empty-${index}`} paddingX={1}>
								<Text> </Text>
							</Box>
						))}
					</Box>
				)}
			</Box>

			{/* Pagination Info */}
			{filteredLicenses.length > 0 && (
				<Box marginTop={1}>
					<Text color="gray">
						Showing {startIndex + 1}-{Math.min(endIndex, filteredLicenses.length)} of {filteredLicenses.length} licenses
						{totalPages > 1 && (
							<Text color="cyan"> • Page {currentPage + 1} of {totalPages}</Text>
						)}
					</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="yellow">
					{isSearching
						? "Type to search • [Enter] confirm • [Esc] cancel"
						: "Commands: [↑/↓] or [j/k] navigate • [c] copy key • [s] search • [n] new license • [Esc/b] back"}
				</Text>
			</Box>
		</Box>
	);
};

// Main App Component
const App: React.FC = () => {
	const { exit } = useApp();
	const [currentScreen, setCurrentScreen] = useState<
		"dashboard" | "licenses" | "create-license"
	>("dashboard");
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const [successMessage, setSuccessMessage] = useState("");

	useInput((input, key) => {
		if (input === "q" || (key.ctrl && input === "c")) {
			exit();
		}

		if (currentScreen === "dashboard") {
			if (input === "1") {
				setCurrentScreen("dashboard");
			} else if (input === "2") {
				setCurrentScreen("licenses");
			}
		}
	});

	return (
		<Box flexDirection="column" height="100%">
			{currentScreen === "dashboard" && <Dashboard />}
			{currentScreen === "licenses" && (
				<Licenses
					onBack={() => {
						setSuccessMessage("");
						setCurrentScreen("dashboard");
					}}
					onCreateLicense={() => {
						setSuccessMessage("");
						setCurrentScreen("create-license");
					}}
					refreshTrigger={refreshTrigger}
					successMessage={successMessage}
				/>
			)}
			{currentScreen === "create-license" && (
				<CreateLicense
					onBack={() => setCurrentScreen("licenses")}
					onSuccess={(message: string) => {
						setSuccessMessage(message);
						setRefreshTrigger(prev => prev + 1);
						setCurrentScreen("licenses");
					}}
				/>
			)}

			{/* Navigation */}
			{currentScreen === "dashboard" && (
				<Box marginTop={1}>
					<Text color="yellow">
						Navigation: [1] Dashboard • [2] Licenses • [q] Quit
					</Text>
				</Box>
			)}
		</Box>
	);
};

render(<App />);
