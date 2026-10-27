"""Conditional workload/cost model; inputs are observations, growth and depth are scenarios."""
import json
import math
import statistics
import sys
from pathlib import Path

DAY = 86400
TOKEN_PRICE_PER_MILLION = .042


def maintenance(keywords, pages=1, hot=.05, warm=.25, hot_days=1, warm_days=14, cold_days=45):
    if not (0 <= hot <= 1 and 0 <= warm <= 1 and hot + warm <= 1):
        raise ValueError('Keyword shares must form a population')
    return keywords * pages * (hot / hot_days + warm / warm_days + (1-hot-warm) / cold_days)


def queue_days(pages, daily_capacity, maintenance_per_day):
    spare = daily_capacity - maintenance_per_day
    return pages / spare if spare > 0 else None


def closed_workload(products, candidates, acceptance, pages_per_keyword,
                    ads_latency=.9, search_latency=.3, jev_latency=.15):
    """One-time known-ASIN mining plus its first-generation keyword scans; no recursion.

    Serial cases assume ideal overlap of stage visits, so are optimistic planning estimates.
    DB per-judgment time approximates the one observed production pass, NOT a DB benchmark.
    Queue cases serialize logical work but remove the unconditional ten-second sleep.
    Their provider clock bounds assume batched persistence before claiming quota-limited speed.
    """
    keywords = math.ceil(candidates * acceptance)
    pages = math.ceil(keywords * pages_per_keyword)
    auto = math.ceil(keywords * .7)  # Scenario: 70% of first-generation trials graduate.
    # Autocomplete requests are counted; new phrases they introduce are deliberately separate.
    results = []
    for batch in (25, 100):
        judgments = math.ceil(candidates / batch)
        # Parent-local batches cannot pool unrelated candidates as efficiently as a global batcher.
        visits = max(products, math.ceil(judgments / 2))
        cycles = max(visits, pages, auto)
        seconds = 10 * cycles + .5 * cycles + ads_latency * products + products * 2
        seconds += candidates * .14 + judgments * jev_latency
        seconds += pages * (search_latency + 2.5) + auto * .7
        results.append({'mode': 'current-25' if batch == 25 else 'batch-only-100',
                        'days': seconds / DAY, 'jevRequests': judgments,
                        'assumedCandidateWriteSeconds': candidates * .14})
    # Existing budget after observed 2.0 RPS header: 2 * .8 safety * .1 background = .16 RPS.
    calls = math.ceil(candidates / 100)
    queue_seconds = max(products * 10, pages / .16, auto * 10, calls * 2)
    # Serial service demand includes provider HTTP and hypothetical bulk database work.
    work_seconds = products * (ads_latency + .5) + pages * (search_latency + .5)
    work_seconds += calls * (jev_latency + .5) + auto * .7
    queue_seconds = max(queue_seconds, work_seconds)
    head_seconds = max(products * 10, keywords / .16, auto * 10, calls * 2)
    results += [{'mode': 'ready-queue-full-depth', 'days': queue_seconds / DAY,
                 'jevRequests': calls, 'floorOnly': True},
                {'mode': 'ready-queue-head-first', 'days': head_seconds / DAY,
                 'jevRequests': calls, 'floorOnly': True}]
    return {'products': products, 'uniqueCandidates': candidates, 'firstGenerationKeywords': keywords,
            'initialPages': pages, 'autocompleteSeeds': auto,
            'autocompleteNewCandidatesNotIncludedUpperBound': auto * 10,
            'jevInputTokens': candidates * 152.75,
            'jevCostDollars': candidates * 152.75 / 1e6 * TOKEN_PRICE_PER_MILLION,
            'approaches': results}


def frontier(reproduction, starting_products, generations=4):
    population = float(starting_products)
    result = []
    for generation in range(generations):
        result.append({'generation': generation, 'newProducts': population})
        population *= reproduction
    return result


def model(root):
    snapshot = json.loads((root / 'snapshot.json').read_text())
    sample = json.loads((root / 'sample-summary.json').read_text())
    extra = (json.loads((root / 'extra-snapshot.json').read_text())
             if (root / 'extra-snapshot.json').exists() else snapshot['extra'])
    products = sum(row['unmined'] for row in snapshot['bands'] if not row['official'])
    strong = sum(row['unmined'] for row in snapshot['bands']
                 if not row['official'] and row['band'] in ['under100k','100kTo300k','300kTo1m'])
    acceptance = sample['adsEligibleAccepted'] / sample['adsEligibleJudged'] if sample['adsEligibleJudged'] else .5
    anchor_count = sample['adsEligibleProducts']
    anchor_unique = sample['adsEligibleUnique']
    scenarios = []
    # Deliberately varied exponents, not a fitted prediction of Amazon's unknown graph.
    for beta in (.65, .8, .95):
        candidates = math.ceil(min(100 * products, anchor_unique * (products / anchor_count) ** beta))
        for depth in (2, 5, 10):
            scenarios.append({'beta': beta, 'pagesPerKeyword': depth,
                              **closed_workload(products, candidates, acceptance, depth,
                                               ads_latency=sample['adsLatencyMs']['median']/1000,
                                               search_latency=sample['searchLatencyMs']['median']/1000)})
    tiers = []
    for keywords in (10000, 50000, 100000, 250000):
        for depth in (1, 3):
            pages = maintenance(keywords, depth)
            tiers.append({'keywords': keywords, 'pagesPerCheck': depth, 'pagesPerDay': pages,
                          'budgetUseFraction': pages / (DAY * .16),
                          'sparePagesPerDay': max(0, DAY * .16 - pages)})
    refresh_intervals = {'under200k':1,'200kTo500k':3,'500kTo1m':7,'1mTo3m':14,'over3m':30}
    refresh_products = sum(row['products'] / refresh_intervals[row['band']]
                           for row in extra['refresh'] if row['band'] in refresh_intervals)
    refresh_merch = sum(row['merch'] / refresh_intervals[row['band']]
                        for row in extra['refresh'] if row['band'] in refresh_intervals)
    history = {row['band']:row['products'] for row in extra['history']}
    max_jev = products * 100 * 152.75 / 1e6 * TOKEN_PRICE_PER_MILLION
    return {'knownMiningProducts': products, 'rankedUnder1m': strong,
            'coldOrUnranked': products - strong, 'measuredCandidateAcceptance': acceptance,
            'observedAdsUniquePerProduct': anchor_unique / anchor_count,
            'providerDailyCaps': {'adsAt10Seconds': DAY/10,'autocompleteAt10Seconds':DAY/10,
                                  'jevAt2Seconds100Cases':DAY/2*100,'spapiDefault':DAY*.1,
                                  'spapiObserved':DAY*.16},
            'knownAdsAbsoluteMinDays': (products-1)*10/DAY,
            'strongAdsAbsoluteMinHours': (strong-1)*10/3600,
            'knownCatalogWorstCaseJevDollarsNoDedup': max_jev,
            'scenarios':scenarios, 'maintenance':tiers,
            'keywordMixAssumption':{'hot':.05,'warm':.25,'cold':.7,
                                    'intervalDays':{'hot':1,'warm':14,'cold':45}},
            'listingRefresh':{'rankedAllProductsPerDay':refresh_products,
                              'rankedMerchPerDay':refresh_merch,
                              'batch20CallsPerDayAllLowerBound':refresh_products/20,
                              'batch20CallsPerDayMerchLowerBound':refresh_merch/20,
                              'missingRanksExcludedFromCalculation':True},
            'keepa':{'automaticDailyTokens':history['daily']+history['weekly']/7,
                     'dailyTokenSupply':20*60*24},
            'reproductionExamples':{str(value):frontier(value,100) for value in (.5,1,2,10)},
            'caveats':['No automatic keyword/ASIN recursive frontier is included in closed workloads.',
                       'Queue estimates are quota/service-demand floors, not measured wall times.',
                       'Maintenance reduces spare capacity; divide new page backlog by spare pages/day.',
                       'Old/new ASIN overlap, keyword acceptance and finite universe sizes can change.',
                       'No model can infer an Amazon-wide finish date from this small sample.']}


if __name__ == '__main__':
    print(json.dumps(model(Path(sys.argv[1])), indent=2))
