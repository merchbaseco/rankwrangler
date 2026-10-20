const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const revisionIsLive = (body, revision) =>
    body?.status === 'ok' && body?.revision === revision;

export const waitForHealth = async ({
    urls,
    revision,
    timeoutMs,
    intervalMs,
    fetchImpl,
    now = Date.now,
    sleepImpl = sleep,
}) => {
    if (!revision) {
        throw new Error('HEALTH_REVISION is required.');
    }
    if (urls.length === 0) {
        throw new Error('At least one health URL is required.');
    }

    const started = now();
    let lastFailure = 'no response yet';
    for (;;) {
        const failures = [];
        for (const url of urls) {
            failures.push(...(await readFailure(url, revision, fetchImpl)));
        }
        if (failures.length === 0) {
            console.log(`Health converged on ${revision}.`);
            return;
        }
        lastFailure = failures.join('\n');
        if (now() - started >= timeoutMs) {
            throw new Error(
                `Health did not converge on ${revision} within ${timeoutMs}ms.\n${lastFailure}`,
            );
        }
        await sleepImpl(intervalMs);
    }
};

const main = async () => {
    const revision = process.env.HEALTH_REVISION ?? '';
    const timeoutMs = Number(process.env.HEALTH_TIMEOUT_SECONDS ?? '180') * 1000;
    const intervalMs = Number(process.env.HEALTH_INTERVAL_SECONDS ?? '5') * 1000;
    const urls = [process.env.HEALTH_API_URL, process.env.HEALTH_LIVE_URL].filter(Boolean);

    await waitForHealth({
        urls,
        revision,
        timeoutMs,
        intervalMs,
        fetchImpl: globalThis.fetch,
    });
};

const readFailure = async (url, revision, fetchImpl) => {
    try {
        const response = await fetchImpl(url);
        const text = await response.text();
        const body = JSON.parse(text);
        if (response.ok && revisionIsLive(body, revision)) {
            return [];
        }
        return [`${url} returned ${response.status} ${text}`];
    } catch (error) {
        const message = error instanceof Error ? error.message : 'request failed';
        return [`${url} failed: ${message}`];
    }
};

if (import.meta.main) {
    await main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Health check failed.');
        process.exit(1);
    });
}
