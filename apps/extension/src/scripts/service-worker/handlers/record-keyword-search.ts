import {
	createRankWranglerClient,
	DEFAULT_API_BASE_URL,
} from "@rankwrangler/http-client";
import { getExtensionToken } from "../extension-auth";
export const handleRecordKeywordSearch = async (term: string) => {
	const token = await getExtensionToken();
	if (!token) return { success: false };
	const client = createRankWranglerClient({
		baseUrl: DEFAULT_API_BASE_URL,
		apiKey: token,
	});
	await client.product.search.query({ term, limit: 1 });
	return { success: true };
};
