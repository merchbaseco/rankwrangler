import { useUser } from "@clerk/clerk-react";
import { useMemo } from "react";
import { api, type RouterOutputs } from "@/lib/trpc";

export type License = RouterOutputs["api"]["app"]["license"]["details"];

const getPrimaryEmail = (user: ReturnType<typeof useUser>["user"]) => {
	if (!user) return null;
	const primary = user.primaryEmailAddress?.emailAddress;
	if (primary) return primary;
	return user.emailAddresses?.[0]?.emailAddress ?? null;
};

export function useLicense() {
	const { user } = useUser();
	const email = useMemo(() => getPrimaryEmail(user), [user]);
	const hasEmail = Boolean(email);

	const detailsQuery = api.api.app.license.details.useQuery(
		{ searchBy: "email", value: email ?? "" },
		{
			enabled: hasEmail,
			retry: false,
		},
	);

	const generateMutation = api.api.app.license.generate.useMutation({
		onSuccess: () => detailsQuery.refetch(),
	});

	const errorCode = detailsQuery.error?.data?.code;
	const license =
		errorCode === "NOT_FOUND" ? null : (detailsQuery.data ?? null);

	const regenerate = async () => {
		if (!email) return;
		await generateMutation.mutateAsync({ email, unlimited: false });
	};

	return {
		email,
		hasEmail,
		license,
		isLoading: detailsQuery.isLoading,
		isRefetching: detailsQuery.isRefetching,
		error: detailsQuery.error,
		errorCode,
		regenerate,
		isRegenerating: generateMutation.isPending,
	};
}
