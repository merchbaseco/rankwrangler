import { getKeepaAdmissionCapacity } from '@/services/keepa-capacity';
import { admitProductHistory } from '@/services/product-history-admission';
import { createKeepaProvider } from '@/services/providers/keepa/keepa-provider';

export const reconcileHistoryAdmission = async () => {
    const provider = createKeepaProvider();
    if (!provider.isConfigured()) {
        return { didWork: false, reason: 'not_configured' as const };
    }
    await provider.ensureFreshTokenState();
    const result = await admitProductHistory(await getKeepaAdmissionCapacity());
    return { ...result, didWork: result.admitted > 0 };
};
