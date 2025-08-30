export function handlePing(
	message: { type: 'ping' },
	sendResponse: (response: { alive: boolean }) => void,
) {
	sendResponse({ alive: true });
}