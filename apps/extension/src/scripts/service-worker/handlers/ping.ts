export function handlePing(_message: { type: "ping" }) {
	return { alive: true };
}
