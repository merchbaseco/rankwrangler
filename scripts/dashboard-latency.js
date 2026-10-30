// Dashboard latency benchmark. Paste into the console of a signed-in dashboard tab
// (production or local) and run `await rwLatency()`. See docs/operations/dashboard-latency.md.
//
// For each default Explore and Keywords read it reports browser wall time and the server's
// `Server-Timing` split (auth, total) as p50/max over `runs` sequential requests, then times
// switching between the two views until the target grid has rows.
globalThis.rwLatency = async ({ runs = 6, switches = 4 } = {}) => {
    const reads = {
        'product.search': {
            brands: [],
            facets: [],
            isMerchListing: true,
            niche: 'any',
            page: 1,
            pageSize: 50,
            published: 'any',
            recordInterest: false,
            sort: 'salesRankAsc',
            tiers: [],
        },
        'product.searchFacets': {
            brands: [],
            facets: [],
            isMerchListing: true,
            niche: 'any',
            published: 'any',
            tiers: [],
        },
        keywordDirectory: {
            freshness: [],
            heat: [],
            stage: ['graduated'],
            page: 1,
            pageSize: 50,
            sort: 'score',
        },
        'keyword.directoryFacets': { freshness: [], heat: [], stage: ['graduated'] },
        adminStatus: undefined,
    };
    const p50 = values => {
        const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
        return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
    };
    const max = values => Math.round(Math.max(...values));
    const timeRead = async (path, input) => {
        const url = `/api/api.app.${path}${input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
        const wall = [];
        const auth = [];
        const server = [];
        for (let run = 0; run < runs; run += 1) {
            performance.clearResourceTimings();
            const started = performance.now();
            const response = await fetch(url, {
                credentials: 'include',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            await response.text();
            wall.push(performance.now() - started);
            await new Promise(resolve => setTimeout(resolve, 50));
            const entry = performance.getEntriesByType('resource').find(item => item.name.includes(`api.app.${path}`));
            const timing = Object.fromEntries((entry?.serverTiming ?? []).map(item => [item.name, item.duration]));
            auth.push(timing.auth ?? Number.NaN);
            server.push(timing.total ?? Number.NaN);
        }
        return { p50: p50(wall), max: max(wall), authP50: p50(auth), serverP50: p50(server) };
    };
    const grids = { '/explore': 'Ranked designs', '/keywords': 'Keyword directory' };
    const ready = path => {
        const grid = document.querySelector(`[role=grid][aria-label="${grids[path]}"]`);
        return location.pathname === path && grid && grid.querySelectorAll('[role=row]').length > 2;
    };
    const press = element => {
        const init = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true };
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
            element.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init));
        }
        element.dispatchEvent(new MouseEvent('click', init));
    };
    // A MutationObserver, not requestAnimationFrame, so a background tab is not throttled.
    const go = path =>
        new Promise((resolve, reject) => {
            const started = performance.now();
            press(document.querySelector(`[href="${path}"]`));
            if (ready(path)) return resolve(performance.now() - started);
            const observer = new MutationObserver(() => {
                if (!ready(path)) return;
                observer.disconnect();
                clearTimeout(timer);
                resolve(performance.now() - started);
            });
            observer.observe(document.body, { subtree: true, childList: true, attributes: true });
            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`${path} did not render rows`));
            }, 20_000);
        });

    const result = {};
    for (const [path, input] of Object.entries(reads)) result[path] = await timeRead(path, input);
    const toKeywords = [];
    const toExplore = [];
    if (location.pathname !== '/explore') await go('/explore');
    for (let run = 0; run < switches; run += 1) {
        toKeywords.push(await go('/keywords'));
        toExplore.push(await go('/explore'));
    }
    result['switch explore→keywords'] = { p50: p50(toKeywords), max: max(toKeywords) };
    result['switch keywords→explore'] = { p50: p50(toExplore), max: max(toExplore) };
    console.table(result);
    return result;
};
