type PendingOperation = {
	id: string;
	status: "pending";
	retryAfterSeconds: number;
};

type CompletedOperation = {
	id: string;
	status: "completed";
	resource: {
		type: "productHistory";
		marketplaceId: string;
		asin: string;
	} | null;
	error: {
		code: string;
		message: string;
	} | null;
};

type PollableOperation = PendingOperation | CompletedOperation;

export const pollProductHistoryOperation = async ({
	operation,
	getOperation,
	wait = waitFor,
}: {
	operation: PollableOperation;
	getOperation: (id: string) => Promise<PollableOperation>;
	wait?: (durationMs: number) => Promise<void>;
}) => {
	let currentOperation = operation;

	while (currentOperation.status === "pending") {
		await wait(currentOperation.retryAfterSeconds * 1000);
		currentOperation = await getOperation(currentOperation.id);
	}

	return currentOperation;
};

const waitFor = async (durationMs: number) => {
	await new Promise((resolve) => setTimeout(resolve, durationMs));
};
