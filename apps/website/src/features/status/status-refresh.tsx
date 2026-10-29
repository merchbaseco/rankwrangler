import type { RouterOutputs } from '@/lib/trpc';
import { RateLimiterGrid } from './metrics/rate-limiter-grid';
import { RefreshPolicyGrid } from './metrics/refresh-policy-grid';
import { StatusSection } from './status-panel';

type AdminStats = RouterOutputs['api']['app']['getAdminStats'];

/**
 * How often each provider is called per BSR bucket and how many Products fall in each, side by
 * side, then each SP-API operation's rate limiter.
 */
export const StatusRefresh = ({ stats }: { stats: AdminStats }) => (
    <StatusSection caption="Call cadence by BSR bucket" title="Refresh schedules">
        <div className="status-pair">
            <RefreshPolicyGrid buckets={stats.keepaRefreshPolicyBuckets} title="Keepa history" />
            <RefreshPolicyGrid buckets={stats.spApiRefreshPolicyBuckets} title="SP-API refresh" />
        </div>
        <RateLimiterGrid stats={stats.spApiOperationRateLimiterStats} />
    </StatusSection>
);
