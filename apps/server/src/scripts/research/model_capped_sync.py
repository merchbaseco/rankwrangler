"""Evaluate 5/10 seed limits against saved samples and run explicit cost/growth scenarios."""
import json
import math
import re
import statistics
import sys
from pathlib import Path
from model_sync_capacity import DAY, maintenance
from simulate_capped_frontier import simulate

STOPWORDS = set('a an the for with and of to on in t shirt shirts tshirt tshirts tee tees '
                'sweatshirt sweatshirts hoodie hoodies apparel clothing graphic graphics '
                'funny cute cool novelty gift gifts design designs'.split())


def signature(term):
    words = re.findall('[a-z0-9]+', term.lower().replace('t-shirt','tshirt').replace('christma ','christmas '))
    return tuple(sorted({word for word in words if word not in STOPWORDS}))


def select_terms(decisions, cap):
    """Preserve Ads ordering and cap independently of whether a phrase already exists globally."""
    seen = set()
    selected = []
    for row in decisions:
        if row['id'] in ['positive-control','negative-control'] or row['probability'] < .8:
            continue
        key = signature(row['term'])
        if not key or key in seen:
            continue
        seen.add(key)
        selected.append(row['term'].strip().lower())
        if len(selected) == cap:
            break
    return selected


def capped_model(root):
    samples = [json.loads(line) for line in (root/'capped-selection.jsonl').read_text().splitlines()]
    rows = [row for row in samples if row['kind']=='result']
    if not any(row['kind']=='complete' for row in samples):
        raise ValueError('Selection eval must complete before modeling')
    snapshot = json.loads((root/'snapshot.json').read_text())
    existing = {row['normalized_term'] for row in snapshot['keywordSet']}
    n = sum(row['unmined'] for row in snapshot['bands'] if not row['official'])
    # Round-trip cost per ASIN measured from the new product-context judgment, including two controls.
    tokens = statistics.mean(row['usage']['input_tokens'] for row in rows)
    eligible = len(rows)
    output = {'initialEligibleProducts':n,'initialCatalog':snapshot['products'][0]['total'],
              'selectionEvalProducts':eligible,'selectionEvalTokens':sum(row['usage']['input_tokens'] for row in rows),
              'meanSelectionTokensPerAsinIncludingControls':tokens,
              'selectionEvalErrors':[row for row in samples if row['kind']=='error'],
              'positiveControlsAccepted':sum(next(x for x in row['decisions'] if x['id']=='positive-control')['probability']>=.8 for row in rows),
              'negativeControlsRejected':sum(next(x for x in row['decisions'] if x['id']=='negative-control')['probability']<.8 for row in rows),
              'caps':[], 'closedSimulations':[], 'recursiveScenarios':[]}
    for cap in [5,10]:
        selected = [{'asin':row['asin'],'title':row['title'],'terms':select_terms(row['decisions'],cap)} for row in rows]
        all_terms = [term for row in selected for term in row['terms']]
        unique = set(all_terms)-existing
        mean_selected = len(all_terms)/eligible
        scenarios = []
        for beta in [.65,.8,.95]:
            # Extra autocomplete roots: 0.2 genuinely new approved terms per keyword, after all dedup.
            base = min(mean_selected*n, len(unique)*(n/eligible)**beta)
            keys = math.ceil(base/(1-.2))
            pages = keys*5
            auto = math.ceil(keys*.7)
            ads_days = n*10/DAY
            head_floor = max(ads_days,keys/(DAY*.16),auto*10/DAY)
            full_floor = max(ads_days,pages/(DAY*.16),auto*10/DAY)
            # Same current-loop arithmetic as the earlier study, with all 100 candidates judged per ASIN.
            current_seconds = 10.5*max(n,pages,auto)+n*(.746+2)+n*100*.14
            current_seconds += pages*(1.032+2.5)+auto*.7+n*.15
            costs = n*tokens/1e6*.042+auto*10*152.75/1e6*.042
            scenarios.append({'beta':beta,'baseUniqueKeywords':math.ceil(base),'allUniqueKeywordsWithAutocomplete':keys,
                              'totalKeywordSelections':round(mean_selected*n), 'initialPageRequests':pages,
                              'productObservationSlots':pages*20, 'adsRequests':n,'autocompleteRequests':auto,
                              'jevCostDollars':costs,'currentLoopIdealDays':current_seconds/DAY,
                              'readyQueueHeadsFloorDays':head_floor,'readyQueueAllPagesFloorDays':full_floor,
                              'readyQueueHeadsPlanningDays':head_floor/.7,'readyQueueAllPagesPlanningDays':full_floor/.7,
                              'ongoingKeywordHeadsPerDay':maintenance(keys)*.7})
        output['caps'].append({'cap':cap,'sampleSelections':len(all_terms),'sampleDistinctNewTerms':len(unique),
                               'meanSelected':mean_selected,'selected':selected,'initialScenarios':scenarios})
        for beta in [.65,.8,.95]:
            output['closedSimulations'].append(simulate(cap=cap,anchor_unique=len(unique),anchor_count=eligible,
                mean_selected=mean_selected,tokens_per_asin=tokens,beta=beta,
                follow_new_products=False,horizon=90))
        for beta, target, branch in [(.65,100000,.2),(.8,100000,.2),(.95,100000,.2),(.8,100000,0),(.8,100000,.5),(.8,1000000,.2)]:
            scenario = simulate(cap=cap,anchor_unique=len(unique),anchor_count=eligible,
                                mean_selected=mean_selected,tokens_per_asin=tokens,
                                beta=beta,target_merch=target,autocomplete_branch=branch)
            product_bytes = next(int(row['bytes']) for row in snapshot['storage'] if row['relname']=='products')/15121
            for state in scenario['snapshots']:
                # Preserve all 100 source relationships per mined ASIN, even though only 5/10 are indexed.
                candidate_rows = min(state['merchMined']*100,1965*(state['merchMined']/25)**.8)
                bytes_added = max(0,state['totalCatalog']-15121)*product_bytes
                bytes_added += state['merchMined']*(100*129.876+1685.914+mean_selected*400)
                bytes_added += candidate_rows*292.291+state['keywords']*4000
                bytes_added += state['initialPagesAccepted']*20*(434176/1703)
                state['additionalCompactDataGBBeforeHistoryLogsBloat'] = bytes_added/1e9
                state['compactRecordCountBeforeHistoryLogs'] = round(max(0,state['totalCatalog']-15121)
                    +state['merchMined']*101+candidate_rows+state['keywords']*2
                    +state['initialPagesAccepted']*20+state['merchMined']*mean_selected)
            output['recursiveScenarios'].append(scenario)
    return output


if __name__=='__main__':
    print(json.dumps(capped_model(Path(sys.argv[1])),indent=2))
