export type CatalogSession = {
	term: string;
	operationId: string | null;
	queryId: string | null;
};

export type CatalogSelection = CatalogSession & {
	selectedRunId: string | null;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getCatalogOperationPollingInterval = (
	operation:
		| { status: "pending"; retryAfterSeconds: number }
		| { status: "completed" }
		| undefined,
	hasReadError = false,
) => {
	if (operation?.status === "pending") {
		return operation.retryAfterSeconds * 1_000;
	}
	return hasReadError ? 2_000 : false;
};

export const isCatalogRunReadPending = ({
	hasOperation,
	hasOperationReadError = false,
	hasRunReadError,
	hasSelectedRun,
	operationHasResource,
	operationStatus,
}: {
	hasOperation: boolean;
	hasOperationReadError?: boolean;
	hasRunReadError: boolean;
	hasSelectedRun: boolean;
	operationHasResource: boolean;
	operationStatus: "pending" | "completed" | undefined;
}) => {
	if (!hasOperation || hasOperationReadError || hasRunReadError) {
		return false;
	}
	return (
		operationStatus !== "completed" ||
		(operationHasResource && !hasSelectedRun)
	);
};

export const readCatalogSession = (url: URL): CatalogSession => {
	const term = normalizeCatalogTerm(url.searchParams.get("catalogTerm") ?? "");
	const operationId = url.searchParams.get("catalogOperation");
	const queryId = url.searchParams.get("catalogQuery");
	const hasValidOperationIdentity = Boolean(
		operationId &&
			queryId &&
			UUID_PATTERN.test(operationId) &&
			UUID_PATTERN.test(queryId),
	);

	return {
		term,
		operationId: hasValidOperationIdentity ? operationId : null,
		queryId: hasValidOperationIdentity ? queryId : null,
	};
};

export const writeCatalogSession = (
	url: URL,
	session: CatalogSession,
): URL => {
	url.searchParams.set("page", "catalog");
	if (session.term) {
		url.searchParams.set("catalogTerm", session.term);
	} else {
		url.searchParams.delete("catalogTerm");
	}
	if (session.operationId) {
		url.searchParams.set("catalogOperation", session.operationId);
		url.searchParams.set("catalogQuery", session.queryId ?? "");
	} else {
		url.searchParams.delete("catalogOperation");
		url.searchParams.delete("catalogQuery");
	}
	return url;
};

export const resolveCatalogQuerySwitch = (
	current: CatalogSelection,
	nextTerm: string,
): CatalogSelection => {
	const term = normalizeCatalogTerm(nextTerm);
	if (term.toLowerCase() === current.term.toLowerCase()) {
		return { ...current, term };
	}

	return {
		term,
		operationId: null,
		queryId: null,
		selectedRunId: null,
	};
};

export const normalizeCatalogTerm = (term: string) =>
	term.trim().replace(/\s+/g, " ");
