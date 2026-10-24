import { getKeepaAdmissionCapacity } from '@/services/keepa-capacity';
import { admitProductHistory } from '@/services/product-history-admission';
import { getHistoryAdmissionOverloadSnapshot } from '@/services/product-history-overload';
import { createKeepaProvider } from '@/services/providers/keepa/keepa-provider';

export const reconcileHistoryAdmission = async () => {
    const provider = createKeepaProvider();
    if (!provider.isConfigured()) {
        return { didWork: false, reason: 'not_configured' as const };
    }
    await provider.ensureFreshTokenState();
    const [capacity, overload] = await Promise.all([
        getKeepaAdmissionCapacity(),
        getHistoryAdmissionOverloadSnapshot(),
    ]);
    const result = await admitProductHistory(
        capacity ? { ...capacity, newAdmissionsPaused: overload.newAdmissionsPaused } : null
    );
    return { ...result, didWork: result.admitted > 0, overdueCount: overload.overdueCount };
};
