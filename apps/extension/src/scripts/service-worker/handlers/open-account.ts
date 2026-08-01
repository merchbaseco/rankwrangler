import type { OpenAccountMessage } from "../../content/types";
import { openExtensionAccount } from "../extension-auth";

export const handleOpenAccount = async (_message: OpenAccountMessage) => {
	try {
		await openExtensionAccount();
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unable to open account.",
		};
	}
};
