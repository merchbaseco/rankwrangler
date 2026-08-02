import type { OpenAccountMessage } from "../../content/types";
import { openExtensionAccount } from "../extension-auth";

export const handleOpenAccount = async (_message: OpenAccountMessage) => {
	try {
		await openExtensionAccount();
		return { success: true };
	} catch (_error) {
		return {
			success: false,
			error: "Unable to open the Merchbase account page. Try again.",
		};
	}
};
