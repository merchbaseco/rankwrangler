import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import StatsDisplay from './components/StatsDisplay';
import type { LicenseData, LicenseStatus } from '../content/types';

const Popup = () => {
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
    const [licenseInput, setLicenseInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        loadLicenseStatus();
    }, []);

    const loadLicenseStatus = async () => {
        setIsInitialLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({ type: 'getLicenseStatus' });
            if (response.success) {
                setLicenseStatus(response.status);

                // If we have a license but it needs validation, validate it automatically
                if (
                    response.status.licenseKey &&
                    !response.status.isValid &&
                    response.status.error === 'License needs validation'
                ) {
                    await validateLicense(response.status.licenseKey);
                } else {
                    // Set edit mode based on license status
                    const hasValidLicense = response.status.licenseKey && response.status.isValid;
                    setIsEditMode(!hasValidLicense);
                }
            }
        } catch (error) {
            console.error('Failed to load license status:', error);
            setIsEditMode(true); // Default to edit mode on error
        } finally {
            setIsInitialLoading(false);
        }
    };

    const validateLicense = async (licenseKey: string) => {
        setIsValidating(true);
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'validateLicense',
                licenseKey: licenseKey,
            });

            if (response.success) {
                setLicenseStatus(prev =>
                    prev
                        ? {
                              ...prev,
                              isValid: response.valid,
                              error: response.error,
                              lastValidated: Date.now(),
                              licenseData: response.data,
                          }
                        : null
                );

                // Set edit mode based on validation result
                if (response.valid) {
                    setIsEditMode(false);
                    setMessage(''); // Clear any previous messages
                } else {
                    setIsEditMode(true);
                    setMessage(response.error || 'License is invalid');
                }
            }
        } catch (error) {
            setMessage('Failed to validate license');
            setIsEditMode(true);
        } finally {
            setIsValidating(false);
        }
    };

    const saveLicense = async () => {
        if (!licenseInput.trim()) {
            setMessage('Please enter a license key');
            return;
        }

        setIsLoading(true);
        setMessage('');

        try {
            // Save and validate in one operation
            const response = await chrome.runtime.sendMessage({
                type: 'setLicense',
                licenseKey: licenseInput.trim(),
            });

            if (response.success) {
                setLicenseStatus(response.status);

                // If license is valid, exit edit mode and clear input
                if (response.status.isValid) {
                    setIsEditMode(false);
                    setLicenseInput('');
                    setMessage('License saved successfully!');
                } else {
                    // Stay in edit mode if invalid
                    setMessage(response.status.error || 'License is invalid');
                }
            } else {
                setMessage(response.error || 'Failed to save license');
            }
        } catch (error) {
            setMessage('Failed to save license');
        } finally {
            setIsLoading(false);
        }
    };

    const enterEditMode = () => {
        setIsEditMode(true);
        setMessage('');
        // Don't pre-fill with current license for security
        setLicenseInput('');
    };

    const cancelEdit = () => {
        setIsEditMode(false);
        setLicenseInput('');
        setMessage('');
    };

    const getLicenseStatusBadge = () => {
        if (isValidating) {
            return <Badge variant="secondary">Validating...</Badge>;
        }

        if (!licenseStatus?.licenseKey) {
            return <Badge variant="destructive">No License</Badge>;
        }

        if (licenseStatus.error === 'License needs validation') {
            return <Badge variant="outline">Needs Validation</Badge>;
        }

        if (licenseStatus.isValid) {
            // Show usage status if we have license data
            if (licenseStatus.licenseData) {
                const usage = licenseStatus.licenseData.usageToday;
                const limit = licenseStatus.licenseData.dailyLimit;
                const usagePercent = (usage / limit) * 100;

                if (usagePercent >= 90) {
                    return <Badge variant="destructive">Limit Reached</Badge>;
                } else if (usagePercent >= 75) {
                    return <Badge variant="outline">High Usage</Badge>;
                }
            }
            return <Badge variant="default">Valid</Badge>;
        }

        return <Badge variant="destructive">Invalid</Badge>;
    };

    const getLicenseDisplayText = () => {
        if (!licenseStatus?.licenseKey) return 'No license key set';

        const key = licenseStatus.licenseKey;
        if (key.length <= 8) return key;

        return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    };

    return (
        <Card className="w-96">
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center justify-between gap-3">
                        <img
                            src="images/logo.png"
                            alt="RankWrangler"
                            className="h-8 w-auto object-contain drop-shadow-sm"
                        />
                    </div>
                    {getLicenseStatusBadge()}
                </CardTitle>
                <CardDescription>Amazon BSR tracker and analyzer</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {isInitialLoading || isValidating ? (
                    // Loading state
                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <div className="text-sm text-muted-foreground">
                            {isInitialLoading ? 'Loading license...' : 'Validating license...'}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Stats Section */}
                        <StatsDisplay />

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">License:</span>
                                <span className="text-sm text-muted-foreground">
                                    {getLicenseDisplayText()}
                                </span>
                            </div>

                            {licenseStatus?.licenseData && (
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Email:</span>
                                        <span className="font-mono">
                                            {licenseStatus.licenseData.email}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Usage today:</span>
                                        <span className="font-mono">
                                            {licenseStatus.licenseData.usageToday}/
                                            {licenseStatus.licenseData.dailyLimit}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Expires:</span>
                                        <span className="font-mono">
                                            {new Date(
                                                licenseStatus.licenseData.expiresAt
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            {isEditMode ? (
                                // Edit mode: Show input field with Save/Cancel buttons
                                <>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Enter license key..."
                                            value={licenseInput}
                                            onChange={e => setLicenseInput(e.target.value)}
                                            disabled={isLoading}
                                            type="password"
                                            className="text-sm"
                                        />
                                        <Button
                                            onClick={saveLicense}
                                            disabled={isLoading || !licenseInput.trim()}
                                            size="sm"
                                        >
                                            {isLoading ? 'Saving...' : 'Save'}
                                        </Button>
                                    </div>
                                    {licenseStatus?.licenseKey && (
                                        <div className="flex">
                                            <Button
                                                variant="outline"
                                                onClick={cancelEdit}
                                                disabled={isLoading}
                                                size="sm"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                // View mode: Show Edit button when license is valid
                                licenseStatus?.licenseKey &&
                                licenseStatus.isValid && (
                                    <div className="flex">
                                        <Button variant="outline" onClick={enterEditMode} size="sm">
                                            Edit License
                                        </Button>
                                    </div>
                                )
                            )}
                        </div>

                        {message && (
                            <div
                                className={`text-sm p-2 rounded ${
                                    message.includes('success') || message.includes('valid')
                                        ? 'bg-green-50 text-green-700 border border-green-200'
                                        : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                            >
                                {message}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default Popup;
