"""Summarize bounded provider samples and paired Jev evaluations. No network or database writes."""
import json
import statistics
import sys
from collections import Counter
from pathlib import Path


def load_events(root, names):
    return [json.loads(line) for name in names if (root / name).exists()
            for line in (root / name).read_text().splitlines() if line.strip()]


def novelty_curve(groups):
    seen = set()
    curve = []
    for group in groups:
        terms = {value.strip().lower().rstrip(',').strip() for value in group['terms']}
        added = terms - seen
        seen.update(terms)
        curve.append({'asin': group['asin'], 'new': len(added), 'total': len(seen)})
    return curve


def describe(values):
    return {'n': len(values), 'median': statistics.median(values),
            'min': min(values), 'max': max(values)} if values else None


def summarize(root):
    snapshot = json.loads((root / 'snapshot.json').read_text())
    rows = load_events(root, ['provider-sample.jsonl', 'provider-resume.jsonl',
                              'cluster-sample.jsonl', 'frontier-sample.jsonl'])
    ads = list({row['asin']: row for row in rows if row['kind'] == 'ads'}.values())
    eligible_ads = [row for row in ads if not row.get('control')]
    eligible_terms = {term.lower().strip().rstrip(',').strip() for row in eligible_ads for term in row['terms']}
    search = list({(row['term'], row['page']): row for row in rows
                   if row['kind'] == 'search'}.values())
    known = {row['asin'] for row in snapshot['asinSet']}
    terms = set()
    for row in ads:
        terms.update(value.lower().strip().rstrip(',').strip() for value in row['terms'])
    evals = load_events(root, ['jev-eval.jsonl', 'jev-inline-eval.jsonl',
                               'jev-inline-size-eval.jsonl'])
    evaluations = []
    for variant, size in sorted({(row['variant'], row['size']) for row in evals
                                if row['kind'] == 'result'}):
        runs = [row for row in evals if row.get('variant') == variant and row['size'] == size]
        evaluations.append({'variant': variant, 'size': size, 'rounds': len(runs),
                            'goldCorrect': [row['goldCorrect'] for row in runs],
                            'tokensPer100': statistics.median(row['inputTokens'] for row in runs),
                            'requestsPer100': runs[0]['requests'],
                            'httpMs': describe([value for row in runs for value in row['requestTimes']])})
    searches = []
    for row in search:
        merch = [item for item in row['products'] if item['merch'] is True]
        ranks = sorted(item['bsr'] for item in merch if item.get('bsr') and item['bsr'] > 0)
        import math
        strengths = sorted((min(1, max(0, math.log10(1e6 / rank))) for rank in ranks), reverse=True)
        score = 100 * (.4 * strengths[0] + .6 * sum(strengths[:5]) / 5) if strengths else None
        searches.append({'term': row['term'], 'page': row['page'], 'results': len(row['products']),
                         'merch': len(merch), 'newMerch': sum(item['asin'] not in known for item in merch),
                         'newMerchUnder1m': sum(item['asin'] not in known and bool(item.get('bsr'))
                                               and 0 < item['bsr'] < 1e6 for item in merch),
                         'merchUnder1m': len([rank for rank in ranks if rank < 1e6]),
                         'score': score, 'hasNext': row['hasNext'], 'rate': row['rateLimit']})
    judgments = load_events(root, ['provider-judgments.jsonl'])
    decisions = {row['id']: row for run in judgments if run['kind'] == 'result' for row in run['decisions']}
    decision_input = json.loads((root / 'provider-judgment-input.json').read_text()) if decisions else {}
    term_decisions = {row['term']: decisions[row['id']]['accepted']
                      for row in decision_input.get('cases', []) if row['id'] in decisions}
    return {'adsEligibleProducts': len(eligible_ads), 'adsEligibleUnique': len(eligible_terms),
            'adsEligibleAccepted': sum(term_decisions.get(term, False) for term in eligible_terms),
            'adsEligibleJudged': sum(term in term_decisions for term in eligible_terms),
            'adsProducts': len(ads), 'adsRaw': sum(len(row['terms']) for row in ads),
            'adsUnique': len(terms), 'adsLatencyMs': describe([row['ms'] for row in ads]),
            'adsBands': dict(Counter(row['band'] for row in ads)),
            'diverseNovelty': novelty_curve([row for row in ads if row['band'] != 'hawaiian-christmas-cluster']),
            'clusterNovelty': novelty_curve([row for row in ads if row['band'] == 'hawaiian-christmas-cluster']),
            'evaluations': evaluations, 'searches': searches,
            'searchLatencyMs': describe([row['ms'] for row in search]),
            'autocomplete': [row for row in rows if row['kind'] == 'autocomplete'],
            'errors': [row for row in rows if row['kind'] in ['error', 'laneFailure']],
            'judged': len(term_decisions), 'accepted': sum(term_decisions.values()),
            'adsJudged': sum(term in term_decisions for term in terms),
            'adsAccepted': sum(term_decisions.get(term, False) for term in terms)}


if __name__ == '__main__':
    print(json.dumps(summarize(Path(sys.argv[1])), indent=2))
