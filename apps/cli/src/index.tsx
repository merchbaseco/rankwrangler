import clipboard from 'clipboardy';
import { Box, render, Text, useApp, useInput, useStdout } from 'ink';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

// import Divider from 'ink-divider'; // Has build issues with Vite
// import { Badge, StatusMessage } from '@inkjs/ui'; // Causing issues, will revisit later

// Simple API client
class SimpleAPIClient {
    private baseUrl = 'https://merchbase.co/api';
    private adminKey = 'REMOVED_HARDCODED_ADMIN_KEY';

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
        const url = `${this.baseUrl}${endpoint}`;
        const requestBody = {
            adminKey: this.adminKey,
            ...body,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();

        try {
            const jsonResponse = JSON.parse(responseText);
            return jsonResponse;
        } catch (_err) {
            return { success: false, error: 'Invalid JSON response', rawResponse: responseText };
        }
    }

    async getLicenseStats() {
        return this.get('/admin/license/stats');
    }

    async getLicenses() {
        return this.get('/admin/license/list');
    }

    async createLicense(email: string, unlimited: boolean = false) {
        return this.post('/admin/license/generate', {
            email,
            unlimited,
        });
    }

    async deleteLicense(licenseId: string) {
        return this.post('/admin/license/delete', {
            licenseId,
        });
    }

    async testGetProduct(asin: string, marketplaceId: string = 'ATVPDKIKX0DER') {
        // First get a random active license from the database
        const licensesResult = await this.getLicenses();
        if (!licensesResult.success || !licensesResult.data || licensesResult.data.length === 0) {
            return {
                success: false,
                error: 'No licenses available for testing',
            };
        }

        // Get all licenses (no expiry filtering needed since licenses are permanent)
        const activeLicenses = licensesResult.data;

        if (activeLicenses.length === 0) {
            return {
                success: false,
                error: 'No active licenses available for testing',
            };
        }

        // Pick a random active license
        const randomLicense = activeLicenses[Math.floor(Math.random() * activeLicenses.length)];

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${randomLicense.key}`,
        };

        const response = await fetch(`${this.baseUrl}/getProductInfo`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                asin,
                marketplaceId,
            }),
        });

        const result = await response.json();

        // Add which license was used for reference
        return {
            ...result,
            testInfo: {
                licenseUsed: randomLicense.email,
                licenseId: randomLicense.id,
            },
        };
    }

    async clearProductCache() {
        return this.post('/admin/cache/clear');
    }
}

const api = new SimpleAPIClient();

// Breadcrumb Component
const Breadcrumb: React.FC<{ path: string[] }> = ({ path }) => {
    return (
        <Box>
            {path.map((item, index) => (
                <Box key={item} flexDirection="row">
                    {index > 0 && (
                        <Text color="gray" dimColor>
                            {' › '}
                        </Text>
                    )}
                    <Text
                        bold={index === path.length - 1}
                        color={index === path.length - 1 ? 'white' : 'gray'}
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
    const [error, setError] = useState<string>('');

    // Calculate responsive dimensions
    const terminalWidth = stdout.columns;
    const halfWidth = Math.floor((terminalWidth - 6) / 2); // Space for 2 boxes side by side

    useEffect(() => {
        // Initial load
        api.getLicenseStats().then(result => {
            if (result.success) {
                setStats(result.data);
            } else {
                setError(result.error || 'Failed to load stats');
            }
            setLoading(false);
        });

        // Set up auto-refresh every 10 seconds
        const intervalId = setInterval(() => {
            api.getLicenseStats().then(result => {
                if (result.success) {
                    setStats(result.data);
                    setError(''); // Clear any previous errors
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

                <Breadcrumb path={['License Management CLI']} />
            </Box>

            <Box flexDirection="row" marginY={1} columnGap={2}>
                {/* Consolidated Stats Box */}
                <Box borderStyle="single" borderColor="cyan" padding={1} width={halfWidth}>
                    <Box flexDirection="column">
                        <Text bold color="cyan">
                            📊 License Overview
                        </Text>
                        <Text color="gray">
                            • Total:{' '}
                            <Text bold color="cyan">
                                {stats?.total || 0}
                            </Text>
                        </Text>
                        <Text color="gray">
                            • Active:{' '}
                            <Text bold color="green">
                                {stats?.active || 0}
                            </Text>
                        </Text>
                        <Text color="gray">
                            • Expired:{' '}
                            <Text bold color="red">
                                {stats?.expired || 0}
                            </Text>
                        </Text>
                    </Box>
                </Box>

                {/* Activity Status Box */}
                <Box borderStyle="single" borderColor="cyan" padding={1} width={halfWidth}>
                    <Box flexDirection="column">
                        <Text bold color="cyan">
                            📈 Activity Status
                        </Text>
                        <Text color="gray">• Products cached: {stats?.productsInCache || 0}</Text>
                        <Text color="gray">• SP-API calls: {stats?.recentApiCalls || 0}</Text>
                        <Text color="gray">• System status: All services operational</Text>
                        <Text color="gray">• Last updated: {new Date().toLocaleTimeString()}</Text>
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
    const [email, setEmail] = useState('');
    const [selectedUsageLimit, setSelectedUsageLimit] = useState(0);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'email' | 'usage'>('email');

    const usageLimitOptions = [
        { label: 'Standard (10,000 requests/day)', unlimited: false },
        { label: 'Unlimited', unlimited: true },
    ];

    const validateEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const createLicense = async () => {
        if (!validateEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setIsCreating(true);
        setError('');

        try {
            const unlimited = usageLimitOptions[selectedUsageLimit].unlimited;
            const result = await api.createLicense(email, unlimited);

            if (result.success) {
                onSuccess('✅ License created successfully!');
            } else {
                setError(result.error || 'Failed to create license');
                setIsCreating(false);
            }
        } catch (err) {
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

        if (step === 'email' && key.return && email.trim()) {
            setStep('usage');
        }

        if (step === 'usage') {
            if (key.upArrow || input === 'k') {
                setSelectedUsageLimit(prev => Math.max(0, prev - 1));
            }
            if (key.downArrow || input === 'j') {
                setSelectedUsageLimit(prev => Math.min(usageLimitOptions.length - 1, prev + 1));
            }
            if (key.return) {
                console.log('🚀 Calling createLicense()');
                createLicense();
            }
            if (key.leftArrow || input === 'h') {
                setStep('email');
            }
        }
    });

    return (
        <Box flexDirection="column" marginY={1}>
            {/* Header */}
            <Box flexDirection="column" marginBottom={2}>
                <Gradient name="pastel">
                    <BigText text="RANKWRANGLER" font="block" />
                </Gradient>

                <Breadcrumb path={['License Management CLI', 'Licenses', 'Create New License']} />
            </Box>

            {error && (
                <Box marginBottom={1}>
                    <Text color="red">❌ {error}</Text>
                </Box>
            )}

            <Box flexDirection="column" marginY={1}>
                {/* Email Step */}
                <Box marginBottom={1}>
                    <Text bold color={step === 'email' ? 'cyan' : 'gray'}>
                        1. Email Address:
                    </Text>
                </Box>
                <Box marginBottom={2}>
                    {step === 'email' ? (
                        <TextInput
                            value={email}
                            onChange={setEmail}
                            placeholder="Enter email address..."
                        />
                    ) : (
                        <Text color="green">📧 {email}</Text>
                    )}
                </Box>

                {/* Usage Limit Step */}
                {step === 'usage' && (
                    <>
                        <Box marginBottom={1}>
                            <Text bold color="cyan">
                                2. Usage Limit:
                            </Text>
                        </Box>
                        <Box flexDirection="column" marginBottom={2}>
                            {usageLimitOptions.map((option, index) => (
                                <Text
                                    key={option.label}
                                    color={selectedUsageLimit === index ? 'cyan' : 'gray'}
                                    backgroundColor={
                                        selectedUsageLimit === index ? 'cyan' : undefined
                                    }
                                >
                                    {selectedUsageLimit === index ? '► ' : '  '}
                                    {option.label}
                                </Text>
                            ))}
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
                    {step === 'email' && 'Press [Enter] to continue • [Esc] to cancel'}
                    {step === 'usage' &&
                        'Use [↑/↓] to select • [Enter] to create license • [←] to go back • [Esc] to cancel'}
                </Text>
            </Box>
        </Box>
    );
};

// API Testing Menu Component
const ApiTestingMenu: React.FC<{
    onBack: () => void;
    onTestGetProduct: () => void;
    onClearCache: () => void;
    successMessage?: string;
}> = ({ onBack, onTestGetProduct, onClearCache, successMessage }) => {
    useInput((input, key) => {
        if (key.escape || input === 'b') {
            onBack();
        }

        if (input === '1') {
            onTestGetProduct();
        }

        if (input === '2') {
            onClearCache();
        }
    });

    return (
        <Box flexDirection="column" marginY={1}>
            {/* Header */}
            <Box flexDirection="column" marginBottom={2}>
                <Gradient name="pastel">
                    <BigText text="RANKWRANGLER" font="block" />
                </Gradient>

                <Breadcrumb path={['License Management CLI', 'API Testing']} />
            </Box>

            {/* Success Message */}
            <Box marginBottom={1} height={1}>
                {successMessage ? <Text color="green">{successMessage}</Text> : <Text> </Text>}
            </Box>

            <Box flexDirection="column" marginY={1}>
                <Text bold color="cyan" marginBottom={1}>
                    🔧 Available API Endpoints:
                </Text>

                <Box borderStyle="single" borderColor="cyan" padding={1}>
                    <Box flexDirection="column">
                        <Text color="white">
                            [1] Get Product Info - Test product data retrieval
                        </Text>
                        <Text color="white">
                            [2] Clear Product Cache - Remove all cached products
                        </Text>
                        <Text color="gray" marginTop={1}>
                            More endpoints coming soon...
                        </Text>
                    </Box>
                </Box>
            </Box>

            <Box marginTop={1}>
                <Text color="yellow">
                    Commands: [1] Test Get Product • [2] Clear Cache • [Esc/b] Back to Dashboard
                </Text>
            </Box>
        </Box>
    );
};

// Test Get Product Component
const TestGetProduct: React.FC<{
    onBack: () => void;
}> = ({ onBack }) => {
    const [asin, setAsin] = useState('');
    const [marketplaceId, setMarketplaceId] = useState('ATVPDKIKX0DER');
    const [isTesting, setIsTesting] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'asin' | 'marketplace' | 'result'>('asin');

    const marketplaceOptions = [
        { label: 'US (ATVPDKIKX0DER)', id: 'ATVPDKIKX0DER' },
        { label: 'CA (A2EUQ1WTGCTBG2)', id: 'A2EUQ1WTGCTBG2' },
        { label: 'MX (A1AM78C64UM0Y8)', id: 'A1AM78C64UM0Y8' },
        { label: 'UK (A1F83G8C2ARO7P)', id: 'A1F83G8C2ARO7P' },
    ];

    const [selectedMarketplace, setSelectedMarketplace] = useState(0);

    const testProduct = async () => {
        setIsTesting(true);
        setError('');
        setResult(null);

        try {
            const startTime = Date.now();
            const response = await api.testGetProduct(asin.trim(), marketplaceId);
            const responseTime = Date.now() - startTime;

            setResult({
                ...response,
                responseTime,
            });
            setStep('result');
        } catch (err) {
            setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsTesting(false);
        }
    };

    useInput((input, key) => {
        if (key.escape && !isTesting) {
            onBack();
            return;
        }

        if (isTesting) return;

        if (step === 'marketplace') {
            if (key.upArrow || input === 'k') {
                setSelectedMarketplace(prev => Math.max(0, prev - 1));
            }
            if (key.downArrow || input === 'j') {
                setSelectedMarketplace(prev => Math.min(marketplaceOptions.length - 1, prev + 1));
            }
            if (key.return) {
                setMarketplaceId(marketplaceOptions[selectedMarketplace].id);
                testProduct();
            }
            if (key.leftArrow || input === 'h') {
                setStep('asin');
            }
        }

        if (step === 'asin' && key.return && asin.trim()) {
            setStep('marketplace');
        }

        if (step === 'result') {
            if (input === 'c' && result?.data?.asin) {
                clipboard.writeSync(result.data.asin);
            }
            if (input === 'j' && result) {
                clipboard.writeSync(JSON.stringify(result, null, 2));
            }
            if (input === 'r') {
                setStep('asin');
                setResult(null);
                setError('');
            }
        }
    });

    return (
        <Box flexDirection="column" marginY={1}>
            {/* Header */}
            <Box flexDirection="column" marginBottom={2}>
                <Gradient name="pastel">
                    <BigText text="RANKWRANGLER" font="block" />
                </Gradient>

                <Breadcrumb path={['License Management CLI', 'API Testing', 'Test Get Product']} />
            </Box>

            {error && (
                <Box marginBottom={1}>
                    <Text color="red">❌ {error}</Text>
                </Box>
            )}

            <Box flexDirection="column" marginY={1}>
                {/* ASIN Step */}
                <Box marginBottom={1}>
                    <Text bold color={step === 'asin' ? 'cyan' : 'gray'}>
                        1. Product ASIN:
                    </Text>
                </Box>
                <Box marginBottom={2}>
                    {step === 'asin' ? (
                        <TextInput
                            value={asin}
                            onChange={setAsin}
                            placeholder="Enter ASIN (e.g., B0DPYPC75R)..."
                        />
                    ) : (
                        <Text color="green">📦 {asin}</Text>
                    )}
                </Box>

                {/* Marketplace Step */}
                {(step === 'marketplace' || step === 'result') && (
                    <>
                        <Box marginBottom={1}>
                            <Text bold color={step === 'marketplace' ? 'cyan' : 'gray'}>
                                2. Marketplace:
                            </Text>
                        </Box>
                        {step === 'marketplace' ? (
                            <Box flexDirection="column" marginBottom={2}>
                                {marketplaceOptions.map((option, index) => (
                                    <Text
                                        key={option.id}
                                        color={selectedMarketplace === index ? 'cyan' : 'gray'}
                                        backgroundColor={
                                            selectedMarketplace === index ? 'cyan' : undefined
                                        }
                                    >
                                        {selectedMarketplace === index ? '► ' : '  '}
                                        {option.label}
                                    </Text>
                                ))}
                            </Box>
                        ) : (
                            <Box marginBottom={2}>
                                <Text color="green">
                                    🌍 {marketplaceOptions.find(m => m.id === marketplaceId)?.label}
                                </Text>
                            </Box>
                        )}
                    </>
                )}

                {/* Results */}
                {step === 'result' && result && (
                    <>
                        <Box marginBottom={1}>
                            <Text bold color="cyan">
                                3. API Response:
                            </Text>
                        </Box>
                        <Box
                            borderStyle="single"
                            borderColor={result.success ? 'green' : 'red'}
                            padding={1}
                            marginBottom={2}
                        >
                            <Box flexDirection="column">
                                {result.success ? (
                                    <>
                                        <Text color="green">
                                            ✅ Success ({result.responseTime}ms)
                                        </Text>
                                        <Text color="gray">
                                            License used: {result.testInfo?.licenseUsed}
                                        </Text>
                                        <Text> </Text>
                                        <Text color="cyan">Product Data:</Text>
                                        <Text color="white">• ASIN: {result.data.asin}</Text>
                                        <Text color="white">
                                            • Marketplace: {result.data.marketplaceId}
                                        </Text>
                                        <Text color="white">• BSR: {result.data.bsr || 'N/A'}</Text>
                                        <Text color="white">
                                            • Creation Date: {result.data.creationDate || 'N/A'}
                                        </Text>
                                        <Text color="white">
                                            • Cached: {result.data.metadata?.cached ? 'Yes' : 'No'}
                                        </Text>
                                        <Text color="white">
                                            • Last Fetched: {result.data.metadata?.lastFetched}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Text color="red">❌ Failed ({result.responseTime}ms)</Text>
                                        <Text color="red">Error: {result.error}</Text>
                                        {result.testInfo?.licenseUsed && (
                                            <Text color="gray">
                                                License used: {result.testInfo.licenseUsed}
                                            </Text>
                                        )}
                                    </>
                                )}
                            </Box>
                        </Box>
                    </>
                )}
            </Box>

            {isTesting && (
                <Box marginY={1}>
                    <Text color="cyan">
                        <Spinner type="dots" /> Testing API endpoint...
                    </Text>
                </Box>
            )}

            <Box marginTop={1}>
                <Text color="yellow">
                    {step === 'asin' && 'Enter ASIN and press [Enter] • [Esc] to go back'}
                    {step === 'marketplace' &&
                        'Use [↑/↓] to select • [Enter] to test • [←] to go back • [Esc] to cancel'}
                    {step === 'result' &&
                        'Commands: [c] copy ASIN • [j] copy JSON • [r] test again • [Esc] back'}
                </Text>
            </Box>
        </Box>
    );
};

// Clear Product Cache Component
const ClearProductCache: React.FC<{
    onBack: () => void;
    onSuccess: (message: string) => void;
}> = ({ onBack, onSuccess }) => {
    const [isClearing, setIsClearing] = useState(false);
    const [error, setError] = useState('');
    const [showConfirm, setShowConfirm] = useState(true);

    const clearCache = async () => {
        setIsClearing(true);
        setError('');

        try {
            const result = await api.clearProductCache();

            if (result.success) {
                const clearedCount = result.data?.clearedCount || 0;
                onSuccess(`✅ Cache cleared! Removed ${clearedCount} cached products.`);
            } else {
                setError(result.error || 'Failed to clear cache');
                setIsClearing(false);
            }
        } catch (err) {
            setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsClearing(false);
        }
    };

    useInput((input, key) => {
        if (key.escape && !isClearing) {
            onBack();
            return;
        }

        if (isClearing) return;

        if (showConfirm) {
            if (input === 'y' || input === 'Y') {
                setShowConfirm(false);
                clearCache();
            }
            if (input === 'n' || input === 'N') {
                onBack();
            }
        }
    });

    return (
        <Box flexDirection="column" marginY={1}>
            {/* Header */}
            <Box flexDirection="column" marginBottom={2}>
                <Gradient name="pastel">
                    <BigText text="RANKWRANGLER" font="block" />
                </Gradient>

                <Breadcrumb
                    path={['License Management CLI', 'API Testing', 'Clear Product Cache']}
                />
            </Box>

            {error && (
                <Box marginBottom={1}>
                    <Text color="red">❌ {error}</Text>
                </Box>
            )}

            <Box flexDirection="column" marginY={1}>
                {showConfirm ? (
                    <>
                        <Box marginBottom={2}>
                            <Text bold color="yellow">
                                ⚠️ Clear Product Cache?
                            </Text>
                        </Box>

                        <Box borderStyle="single" borderColor="yellow" padding={1} marginBottom={2}>
                            <Box flexDirection="column">
                                <Text color="white">
                                    This will permanently delete all cached product data from the
                                    server.
                                </Text>
                                <Text color="gray" marginTop={1}>
                                    • All products will need to be re-fetched from SP-API
                                </Text>
                                <Text color="gray">
                                    • API calls will be slower until cache rebuilds
                                </Text>
                                <Text color="gray">• This action cannot be undone</Text>
                            </Box>
                        </Box>

                        <Box marginBottom={1}>
                            <Text color="cyan">
                                Are you sure you want to clear the product cache?
                            </Text>
                        </Box>
                    </>
                ) : (
                    isClearing && (
                        <Box marginY={1}>
                            <Text color="cyan">
                                <Spinner type="dots" /> Clearing product cache...
                            </Text>
                        </Box>
                    )
                )}
            </Box>

            <Box marginTop={1}>
                <Text color="yellow">
                    {showConfirm &&
                        !isClearing &&
                        'Press [Y] to confirm • [N] to cancel • [Esc] to go back'}
                    {isClearing && 'Clearing cache...'}
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
}> = ({ onBack, onCreateLicense, successMessage }) => {
    const { stdout } = useStdout();
    const [licenses, setLicenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [message, setMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingLicenseId, setDeletingLicenseId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const itemsPerPage = 10;
    const [currentPage, setCurrentPage] = useState(0);

    const loadLicenses = useCallback(async () => {
        setLoading(true);
        const result = await api.getLicenses();

        if (result.success) {
            const licenseData = result.data;

            if (Array.isArray(licenseData)) {
                setLicenses(licenseData);
            } else if (licenseData?.licenses && Array.isArray(licenseData.licenses)) {
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
    }, [loadLicenses]);

    const filteredLicenses = licenses.filter(
        license =>
            license.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            license.id?.toLowerCase().includes(searchQuery.toLowerCase())
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
    }, []);

    const showMessage = useCallback((msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 3000);
    }, []);

    const handleDeleteLicense = useCallback(async () => {
        if (!deletingLicenseId) return;

        setIsDeleting(true);
        try {
            const result = await api.deleteLicense(deletingLicenseId);
            if (result.success) {
                showMessage('✅ License deleted successfully');
                // Refresh license list
                const licensesData = await api.getLicenses();
                if (licensesData.success) {
                    setLicenses(licensesData.data || []);
                    // Reset selection if needed
                    if (selectedIndex >= (licensesData.data?.length || 0)) {
                        setSelectedIndex(Math.max(0, (licensesData.data?.length || 1) - 1));
                    }
                }
            } else {
                showMessage(`❌ Failed to delete license: ${result.error}`);
            }
        } catch (_error) {
            showMessage('❌ Error deleting license');
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
            setDeletingLicenseId(null);
        }
    }, [deletingLicenseId, selectedIndex, showMessage]);

    // Handle success message from license creation
    useEffect(() => {
        if (successMessage) {
            showMessage(successMessage);
        }
    }, [successMessage, showMessage]);

    // Helper function to truncate text
    const truncateText = (text: string, maxWidth: number) => {
        if (text.length <= maxWidth - 3) return text;
        return `${text.substring(0, maxWidth - 3)}...`;
    };

    useInput((input, key) => {
        // When in search mode, only handle Escape to exit search
        if (isSearching) {
            if (key.escape) {
                setIsSearching(false);
            }
            return; // Don't handle other keys when searching
        }

        // When in delete confirmation mode
        if (showDeleteConfirm) {
            if (input === 'y' || input === 'Y') {
                handleDeleteLicense();
            }
            if (input === 'n' || input === 'N' || key.escape) {
                setShowDeleteConfirm(false);
                setDeletingLicenseId(null);
            }
            return; // Don't handle other keys when in delete confirmation
        }

        // Normal navigation when not in search mode
        if (key.escape || input === 'b') {
            onBack();
        }

        if (input === 's') {
            setIsSearching(true);
        }

        if (input === 'n') {
            onCreateLicense();
        }

        if (input === 'c') {
            const license = currentPageLicenses[selectedIndex];
            if (license?.key) {
                clipboard.writeSync(license.key);
                showMessage('✅ License key copied to clipboard');
            }
        }

        if (input === 'd') {
            const license = currentPageLicenses[selectedIndex];
            if (license?.id) {
                setDeletingLicenseId(license.id);
                setShowDeleteConfirm(true);
            }
        }

        if (key.upArrow || input === 'k') {
            setSelectedIndex(prev => {
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

        if (key.downArrow || input === 'j') {
            setSelectedIndex(prev => {
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

                <Breadcrumb path={['License Management CLI', 'Licenses']} />
            </Box>

            {/* Always reserve space for status messages */}
            <Box marginBottom={1} height={1}>
                {message ? <Text color="green">{message}</Text> : <Text> </Text>}
            </Box>

            {!showDeleteConfirm ? (
                <>
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
                            <Text color={searchQuery ? 'white' : 'gray'}>
                                {searchQuery || '(none) - Press [s] to search'}
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

                                    return (
                                        <Box
                                            key={license.id || index}
                                            backgroundColor={isSelected ? 'cyan' : undefined}
                                            paddingX={1}
                                        >
                                            <Box width="100%" justifyContent="space-between">
                                                <Text color={isSelected ? 'black' : 'green'} bold>
                                                    📧{' '}
                                                    {truncateText(
                                                        license.email || 'No email',
                                                        maxEmailWidth
                                                    )}
                                                </Text>
                                                <Text color={isSelected ? 'black' : 'gray'}>
                                                    {truncateText(
                                                        license.metadata?.limits
                                                            ?.requests_per_day === -1
                                                            ? 'Unlimited'
                                                            : `${license.metadata?.limits?.requests_per_day || 10000}/day`,
                                                        maxTimeWidth
                                                    )}
                                                </Text>
                                            </Box>
                                        </Box>
                                    );
                                })}

                                {/* Fill remaining space with empty rows to maintain consistent height */}
                                {Array.from(
                                    { length: itemsPerPage - currentPageLicenses.length },
                                    (_, index) => (
                                        <Box
                                            key={`page-${currentPage}-spacer-${startIndex + currentPageLicenses.length + index}`}
                                            paddingX={1}
                                        >
                                            <Text> </Text>
                                        </Box>
                                    )
                                )}
                            </Box>
                        )}
                    </Box>

                    {/* Pagination Info */}
                    {filteredLicenses.length > 0 && (
                        <Box marginTop={1}>
                            <Text color="gray">
                                Showing {startIndex + 1}-
                                {Math.min(endIndex, filteredLicenses.length)} of{' '}
                                {filteredLicenses.length} licenses
                                {totalPages > 1 && (
                                    <Text color="cyan">
                                        {' '}
                                        • Page {currentPage + 1} of {totalPages}
                                    </Text>
                                )}
                            </Text>
                        </Box>
                    )}
                </>
            ) : (
                /* Delete Confirmation Modal */
                <Box marginTop={1} marginBottom={1}>
                    <Box borderStyle="single" borderColor="red" padding={1}>
                        <Box flexDirection="column">
                            <Box marginBottom={1}>
                                <Text bold color="red">
                                    ⚠️ Delete License?
                                </Text>
                            </Box>

                            {(() => {
                                const selectedLicense = currentPageLicenses[selectedIndex];
                                return (
                                    <Box flexDirection="column" marginBottom={1}>
                                        <Text color="white">
                                            This will permanently delete the following license:
                                        </Text>
                                        <Text color="gray" marginTop={1}>
                                            • Email: {selectedLicense?.email || 'Unknown'}
                                        </Text>
                                        <Text color="gray">
                                            • License ID:{' '}
                                            {selectedLicense?.id
                                                ? `${selectedLicense.id.substring(0, 8)}...`
                                                : 'Unknown'}
                                        </Text>
                                        <Text color="gray">
                                            • Created:{' '}
                                            {selectedLicense?.createdAt
                                                ? new Date(
                                                      selectedLicense.createdAt
                                                  ).toLocaleDateString()
                                                : 'Unknown'}
                                        </Text>

                                        <Text color="white" marginTop={1}>
                                            After deletion:
                                        </Text>
                                        <Text color="gray">
                                            • The license will be permanently removed from the
                                            database
                                        </Text>
                                        <Text color="gray">
                                            • The user will no longer be able to use it
                                        </Text>
                                        <Text color="gray">• This action cannot be undone</Text>

                                        <Text color="white" marginTop={1}>
                                            {isDeleting ? (
                                                <>
                                                    <Spinner type="dots" /> Deleting license...
                                                </>
                                            ) : (
                                                'Are you sure you want to delete this license?'
                                            )}
                                        </Text>
                                    </Box>
                                );
                            })()}
                        </Box>
                    </Box>
                </Box>
            )}

            <Box marginTop={1}>
                <Text color="yellow">
                    {showDeleteConfirm && !isDeleting
                        ? '[Y] to confirm • [N] to cancel • [Esc] to go back'
                        : isDeleting
                          ? 'Deleting license...'
                          : isSearching
                            ? 'Type to search • [Enter] confirm • [Esc] cancel'
                            : 'Commands: [↑/↓] or [j/k] navigate • [c] copy key • [d] delete • [s] search • [n] new license • [Esc/b] back'}
                </Text>
            </Box>
        </Box>
    );
};

// Main App Component
const App: React.FC = () => {
    const { exit } = useApp();
    const [currentScreen, setCurrentScreen] = useState<
        | 'dashboard'
        | 'licenses'
        | 'create-license'
        | 'api-testing'
        | 'test-get-product'
        | 'clear-cache'
    >('dashboard');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [successMessage, setSuccessMessage] = useState('');

    useInput((input, key) => {
        if (input === 'q' || (key.ctrl && input === 'c')) {
            exit();
        }

        if (currentScreen === 'dashboard') {
            if (input === '1') {
                setCurrentScreen('dashboard');
            } else if (input === '2') {
                setCurrentScreen('licenses');
            } else if (input === '3') {
                setCurrentScreen('api-testing');
            }
        }
    });

    return (
        <Box flexDirection="column" height="100%">
            {currentScreen === 'dashboard' && <Dashboard />}
            {currentScreen === 'licenses' && (
                <Licenses
                    onBack={() => {
                        setSuccessMessage('');
                        setCurrentScreen('dashboard');
                    }}
                    onCreateLicense={() => {
                        setSuccessMessage('');
                        setCurrentScreen('create-license');
                    }}
                    refreshTrigger={refreshTrigger}
                    successMessage={successMessage}
                />
            )}
            {currentScreen === 'create-license' && (
                <CreateLicense
                    onBack={() => setCurrentScreen('licenses')}
                    onSuccess={(message: string) => {
                        setSuccessMessage(message);
                        setRefreshTrigger(prev => prev + 1);
                        setCurrentScreen('licenses');
                    }}
                />
            )}
            {currentScreen === 'api-testing' && (
                <ApiTestingMenu
                    onBack={() => {
                        setSuccessMessage('');
                        setCurrentScreen('dashboard');
                    }}
                    onTestGetProduct={() => {
                        setSuccessMessage('');
                        setCurrentScreen('test-get-product');
                    }}
                    onClearCache={() => {
                        setSuccessMessage('');
                        setCurrentScreen('clear-cache');
                    }}
                    successMessage={successMessage}
                />
            )}
            {currentScreen === 'test-get-product' && (
                <TestGetProduct onBack={() => setCurrentScreen('api-testing')} />
            )}
            {currentScreen === 'clear-cache' && (
                <ClearProductCache
                    onBack={() => setCurrentScreen('api-testing')}
                    onSuccess={(message: string) => {
                        setSuccessMessage(message);
                        setCurrentScreen('api-testing');
                    }}
                />
            )}

            {/* Navigation */}
            {currentScreen === 'dashboard' && (
                <Box marginTop={1}>
                    <Text color="yellow">
                        Navigation: [1] Dashboard • [2] Licenses • [3] API Testing • [q] Quit
                    </Text>
                </Box>
            )}
        </Box>
    );
};

render(<App />);
