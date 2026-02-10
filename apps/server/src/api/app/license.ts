import { router } from '@/api/trpc.js';
import { licenseDelete } from './license-delete.js';
import { licenseDetails } from './license-details.js';
import { licenseGenerate } from './license-generate.js';
import { licenseList } from './license-list.js';
import { licenseReset } from './license-reset.js';

export const appLicenseRouter = router({
    generate: licenseGenerate,
    list: licenseList,
    details: licenseDetails,
    delete: licenseDelete,
    reset: licenseReset,
});
