type PollableProductHistoryOperation =
	| {
			id: string;
			status: "pending";
			retryAfterSeconds: number;
	  }
	| {
			id: string;
			status: "completed";
			resource: unknown;
			error: unknown;
	  };

export const getProductHistoryOperationPollingInterval = (
	operation: PollableProductHistoryOperation | undefined,
) => {
	return operation?.status === "pending"
		? operation.retryAfterSeconds * 1_000
		: false;
};
