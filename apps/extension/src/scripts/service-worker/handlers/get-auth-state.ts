import type {
	AuthStateResponse,
	GetAuthStateMessage,
} from "../../content/types";
import { getExtensionAuthState } from "../extension-auth";

export const handleGetAuthState = async (
	_message: GetAuthStateMessage
): Promise<AuthStateResponse> => {
	const state = await getExtensionAuthState();
	return { success: true, state };
};
