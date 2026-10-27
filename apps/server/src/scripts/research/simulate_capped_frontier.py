"""Expected-value frontier simulation. Finite reachable universes are explicit scenarios, not estimates."""
import heapq
import math
from collections import deque

DAY = 86400


def simulate(*, cap, anchor_unique, anchor_count, mean_selected, tokens_per_asin,
             target_merch=100000, beta=.8, autocomplete_branch=.2, pages=5,
             utilization=.7, novelty_fraction=.25, horizon=180, initial_products=6669, initial_catalog=15121,
             follow_new_products=True):
    if target_merch < initial_products or not 0 <= autocomplete_branch < 1:
        raise ValueError('Invalid reachable universe or autocomplete reproduction')
    if not 0 < utilization <= 1 or pages < 1:
        raise ValueError('Invalid service capacity or page count')
    dt = 1 / 24
    ads_capacity = DAY / 10 * utilization
    page_capacity = DAY * .16 * utilization
    auto_capacity = DAY / 10 * utilization
    mined = 0.0
    merch_seen = float(initial_products)
    other_seen = float(initial_catalog-initial_products)
    keywords = 15.0
    heads = depth = auto = 0.0
    maintenance = due = 0.0
    peak_pending = 0.0
    reached95 = mined95 = cleared = None
    initial_mined = initial_heads = initial_complete = None
    events = []
    ready_maintenance = deque()
    sequence = 0
    snapshots = []
    # Keyword tier mix, among graduated keywords: 5% daily, 25% fortnightly, 70% every 45d.
    intervals = [(1, .7*.05), (14, .7*.25), (45, .7*.7)]
    for step in range(round(horizon/dt)):
        now = step*dt
        while events and events[0][0] <= now+1e-9:
            _, _, amount, interval = heapq.heappop(events)
            due += amount
            ready_maintenance.append((amount, interval))
        work = page_capacity*dt
        recurring = 0.0
        while ready_maintenance and work > 1e-9:
            amount, interval = ready_maintenance.popleft()
            served = min(amount, work)
            recurring += served
            work -= served
            due -= served
            if interval and served:
                sequence += 1
                heapq.heappush(events, (now+dt+interval, sequence, served, interval))
            if amount > served:
                ready_maintenance.appendleft((amount-served, interval))
        maintenance += recurring
        new_heads = min(max(0, keywords-heads), work)
        heads += new_heads
        work -= new_heads
        for interval, share in intervals:
            if new_heads:
                sequence += 1
                heapq.heappush(events, (now+dt+interval, sequence, new_heads*share, interval))
        # A second negative trial head at seven days, then dormancy.
        if new_heads:
            sequence += 1
            heapq.heappush(events, (now+dt+7, sequence, new_heads*.3, 0))
        new_depth = min(max(0, heads*(pages-1)-depth), work)
        depth += new_depth
        acquisition = new_heads+new_depth
        # Ten verified Merch slots per successful 20-result page, 70% of keyword trials viable.
        # Deduplication increases as the explicit reachable product pool is observed.
        merch_draws = acquisition*7*novelty_fraction
        nonmerch_draws = acquisition*13*novelty_fraction
        merch_seen += (target_merch-merch_seen)*(1-math.exp(-merch_draws/target_merch))
        other_seen += max(0, target_merch-other_seen)*(1-math.exp(-nonmerch_draws/target_merch))
        auto += min(max(0, heads*.7-auto), auto_capacity*dt)
        pending = max(0, keywords*pages-heads-depth)
        peak_pending = max(peak_pending, pending)
        spare = max(0, page_capacity-heads*.7*(.05+.25/14+.7/45))
        # One pauseable system; suspend new producers when queued acquisition exceeds two spare days.
        if pending <= 2*max(spare, page_capacity*.1) and due <= page_capacity*dt:
            available = merch_seen if follow_new_products else initial_products
            newly_mined = min(max(0, available-mined), ads_capacity*dt)
            old_curve = min(mean_selected*mined,
                            anchor_unique*(mined/anchor_count)**beta) if mined else 0
            mined += newly_mined
            new_curve = min(mean_selected*mined, anchor_unique*(mined/anchor_count)**beta)
            # Once-only autocomplete is represented by a stable, globally deduplicated branching multiplier.
            keywords += max(0, new_curve-old_curve)/(1-autocomplete_branch)
        if mined >= initial_products-1e-6 and initial_mined is None:
            initial_mined = now+dt
        if initial_mined is not None and pending_heads < 1e-6 and heads*.7-auto < 1e-6 and initial_heads is None:
            initial_heads = now+dt
        if initial_heads is not None and pending_pages < 1e-6 and initial_complete is None:
            initial_complete = now+dt
        if merch_seen >= target_merch*.95 and reached95 is None:
            reached95 = now+dt
        if mined >= target_merch*.95 and mined95 is None:
            mined95 = now+dt
        pending_heads = max(0, keywords-heads)
        pending_pages = max(0, keywords*pages-heads-depth)
        # Milestone only: 95% of reachable products mined and acquisition backlogs under one day.
        if mined95 and pending_pages <= page_capacity and pending_heads <= page_capacity and cleared is None:
            cleared = now+dt
        if step+1 in [24, 7*24, 30*24, 90*24, horizon*24]:
            snapshots.append({'day':round(now+dt), 'merchSeen':round(merch_seen),
                              'totalCatalog':round(merch_seen+other_seen), 'merchMined':round(mined),
                              'keywords':round(keywords), 'keywordHeadsObserved':round(heads),
                              'initialPagesAccepted':round(heads+depth), 'recurringHeads':round(maintenance),
                              'overdueHeads':round(due), 'pendingInitialPages':round(pending_pages),
                              'pendingHeads':round(pending_heads), 'adsCalls':math.ceil(mined),
                              'autocompleteCalls':math.ceil(auto),
                              'jevCostDollars':mined*tokens_per_asin/1e6*.042+auto*10*152.75/1e6*.042})
    return {'cap':cap, 'beta':beta,'reachableMerchScenario':target_merch,
            'autocompleteBranchAssumption':autocomplete_branch,'initialPagesPerKeyword':pages,
            'productiveUtilizationAssumption':utilization,'novelSlotFractionAssumption':novelty_fraction, 'day95PercentSeen':reached95,
            'day95PercentMined':mined95, 'day95PercentMinedAndInitialQueueUnderOneDay':cleared,
            'peakPendingInitialPages':round(peak_pending),
            'dayInitialProductsMined':initial_mined, 'dayInitialProductHeadsComplete':initial_heads,
            'dayInitialProductFullPassComplete':initial_complete,
            'followsNewProducts':follow_new_products, 'snapshots':snapshots}
