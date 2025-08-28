// Core product information from API
export interface ProductInfo {
  asin: string;
  creationDate: string | null;
  bsr: number | null;
  metadata: {
    lastFetched: string; // ISO timestamp
    cached: boolean;
  };
}

// BSR information for display
export interface BSRInfo {
  rank: string;
  category: string;
  dateFirstAvailable: string;
}

// Cached BSR data with timestamp
export interface CachedBSR {
  rank: string;
  category: string;
  dateFirstAvailable: string;
  timestamp: number;
}

// Cache storage structure
export interface BSRCache {
  [asin: string]: CachedBSR;
}

// Extension statistics
export interface Stats {
  totalRequests: number;
  liveSuccessCount: number;
  cacheSuccessCount: number;
  failureCount: number;
}

// Message types for background script communication
export interface GetStatsMessage {
  type: 'getStats';
}

export interface ResetStatsMessage {
  type: 'resetStats';
}

export interface UpdateQueueMessage {
  type: 'updateQueue';
  action: 'add' | 'remove' | 'clear';
  asin?: string;
}

export interface FetchProductInfoMessage {
  type: 'fetchProductInfo';
  asin: string;
  marketplaceId: string;
}

export interface QueueUpdateMessage {
  type: 'queueUpdate';
  count: number;
}

export interface PingMessage {
  type: 'ping';
}

export interface PingResponse {
  alive: boolean;
}

export interface BackgroundPingMessage {
  type: 'background-ping';
}

// License management messages
export interface ValidateLicenseMessage {
  type: 'validateLicense';
  licenseKey?: string;
}

export interface SetLicenseMessage {
  type: 'setLicense';
  licenseKey: string;
}

export interface RemoveLicenseMessage {
  type: 'removeLicense';
}

export interface GetLicenseStatusMessage {
  type: 'getLicenseStatus';
}

export type BackgroundMessage =
  | GetStatsMessage
  | ResetStatsMessage
  | UpdateQueueMessage
  | FetchProductInfoMessage
  | QueueUpdateMessage
  | PingMessage
  | BackgroundPingMessage
  | ValidateLicenseMessage
  | SetLicenseMessage
  | RemoveLicenseMessage
  | GetLicenseStatusMessage;

// API response types
export interface ProductInfoResponse {
  success: boolean;
  data?: ProductInfo;
  error?: string;
}

export interface StatsResponse {
  stats?: Stats;
  queueCount?: number;
}

// License status and response types
export interface LicenseData {
  email: string;
  expiresAt: string; // ISO date string
  usageToday: number;
  dailyLimit: number;
}

export interface LicenseStatus {
  isValid: boolean;
  licenseKey: string | null;
  lastValidated?: number;
  error?: string;
  licenseData?: LicenseData;
}

export interface LicenseResponse {
  success: boolean;
  status?: LicenseStatus;
  error?: string;
}

export interface ValidationResponse {
  success: boolean;
  valid: boolean;
  error?: string;
  data?: LicenseData;
}

// Component props types
export interface BSRDisplayProps {
  asin: string;
  rank: string;
  category: string;
  dateFirstAvailable: string;
  isLoading?: boolean;
  error?: string;
  onCopyAsin?: (asin: string) => void;
}

export interface LoadingIndicatorProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Hook return types
export interface UseProductInfoReturn {
  data: ProductInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseBSRCacheReturn {
  getCached: (asin: string) => Promise<CachedBSR | null>;
  setCached: (asin: string, bsrInfo: BSRInfo) => Promise<void>;
  clearCache: () => Promise<void>;
}

// Constants
export const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
export const DEFAULT_MARKETPLACE_ID = 'ATVPDKIKX0DER'; // US marketplace
export const API_RATE_LIMIT = 2; // requests per second