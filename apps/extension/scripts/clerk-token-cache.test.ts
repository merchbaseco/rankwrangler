import { describe, expect, it, mock } from "bun:test";
import {
	TOKEN_REFRESH_SKEW_SECONDS,
	createClerkTokenProvider,
	readJwtExpiry,
} from "../src/scripts/service-worker/clerk-token-cache";

const createJwt = (exp?: number) => {
	const encode = (value: string) =>
		Buffer.from(value).toString("base64url").replaceAll("=", "");
	const payload = exp === undefined ? {} : { exp };
	return `${encode('{"alg":"none"}')}.${encode(JSON.stringify(payload))}.signature`;
};

describe("Clerk Chrome token provider", () => {
	it("reads only a valid expiry claim", () => {
		const expiry = 1_000_060;

		expect(readJwtExpiry(createJwt(expiry))).toBe(expiry);
		expect(readJwtExpiry("not-a-jwt")).toBeNull();
		expect(readJwtExpiry(createJwt())).toBeNull();
	});

	it("forces Clerk to bypass its SDK token cache", async () => {
		const getToken = mock(() => Promise.resolve(createJwt(1_000_060)));
		const provider = createClerkTokenProvider(() => 1_000_000_000);
		const session = { getToken };

		await provider.getToken(session);

		expect(getToken).toHaveBeenCalledTimes(1);
		expect(getToken).toHaveBeenCalledWith({ skipCache: true });
	});

	it("coalesces concurrent refreshes into one Clerk request", async () => {
		let resolveToken: ((token: string) => void) | undefined;
		const tokenPromise = new Promise<string>((resolve) => {
			resolveToken = resolve;
		});
		const getToken = mock(() => tokenPromise);
		const provider = createClerkTokenProvider(() => 1_000_000_000);
		const session = { getToken };
		const requests = Array.from({ length: 20 }, () => provider.getToken(session));

		expect(getToken).toHaveBeenCalledTimes(1);
		resolveToken?.(createJwt(1_000_060));

		expect(await Promise.all(requests)).toEqual(
			Array.from({ length: 20 }, () => createJwt(1_000_060))
		);
	});

	it("reuses a token only while it is safely before expiry", async () => {
		let now = 1_000_000_000;
		const firstToken = createJwt(now / 1000 + 60);
		const secondToken = createJwt(now / 1000 + 60);
		const getToken = mock()
			.mockResolvedValueOnce(firstToken)
			.mockResolvedValueOnce(secondToken);
		const provider = createClerkTokenProvider(() => now);
		const session = { getToken };

		expect(await provider.getToken(session)).toBe(firstToken);
		now += (60 - TOKEN_REFRESH_SKEW_SECONDS - 1) * 1000;
		expect(await provider.getToken(session)).toBe(firstToken);
		now += 2_000;
		expect(await provider.getToken(session)).toBe(secondToken);

		expect(getToken).toHaveBeenCalledTimes(2);
	});

	it("does not cache tokens without a usable expiry", async () => {
		const getToken = mock()
			.mockResolvedValueOnce("opaque-token")
			.mockResolvedValueOnce("next-token");
		const provider = createClerkTokenProvider(() => 1_000_000_000);
		const session = { getToken };

		expect(await provider.getToken(session)).toBe("opaque-token");
		expect(await provider.getToken(session)).toBe("next-token");
		expect(getToken).toHaveBeenCalledTimes(2);
	});

	it("drops a cached token when the Clerk session changes", async () => {
		const firstSession = {
			getToken: mock().mockResolvedValue(createJwt(1_000_060)),
		};
		const secondSession = {
			getToken: mock().mockResolvedValue(createJwt(1_000_060)),
		};
		const provider = createClerkTokenProvider(() => 1_000_000_000);

		await provider.getToken(firstSession);
		await provider.getToken(secondSession);

		expect(firstSession.getToken).toHaveBeenCalledTimes(1);
		expect(secondSession.getToken).toHaveBeenCalledTimes(1);
	});
});
