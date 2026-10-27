import unittest
from model_capped_sync import select_terms
from simulate_capped_frontier import simulate


class CappedModelTests(unittest.TestCase):
    def test_near_variants_do_not_use_multiple_slots(self):
        terms = ['bigfoot shirt','funny bigfoot t-shirt','bigfoot christmas shirt','santa shirt']
        rows = [dict(id=str(i),term=term,probability=.9) for i,term in enumerate(terms)]
        self.assertEqual(select_terms(rows,2), ['bigfoot shirt','bigfoot christmas shirt'])

    def test_existing_keyword_still_uses_its_selection_slot(self):
        rows = [dict(id='0',term='bigfoot shirt',probability=.9),
                dict(id='1',term='bigfoot christmas shirt',probability=.9)]
        selected = select_terms(rows,1)
        existing = {'bigfoot shirt'}
        self.assertEqual(set(selected)-existing, set())

    def test_underfilled_products_are_not_padded(self):
        rows = [dict(id='0',term='bigfoot shirt',probability=.9),
                dict(id='1',term='unrelated shirt',probability=.1)]
        self.assertEqual(select_terms(rows,10), ['bigfoot shirt'])

    def test_simulated_records_and_calls_obey_supply_and_provider_limits(self):
        result = simulate(cap=5,anchor_unique=94,anchor_count=25,mean_selected=4.8,
                          tokens_per_asin=20124,target_merch=10000,horizon=7)
        for row in result['snapshots']:
            day=row['day']
            self.assertLessEqual(row['merchSeen'],10000)
            self.assertLessEqual(row['totalCatalog'],20000)
            self.assertLessEqual(row['merchMined'],row['merchSeen'])
            self.assertLessEqual(row['adsCalls'],6048*day+1)
            self.assertLessEqual(row['initialPagesAccepted']+row['recurringHeads'],9676.8*day+2)
            self.assertLessEqual(row['keywordHeadsObserved'],row['keywords'])
            self.assertLessEqual(row['initialPagesAccepted'],row['keywordHeadsObserved']*5+5)
            self.assertGreaterEqual(row['overdueHeads'],0)

    def test_closed_backfill_does_not_mine_discovered_products(self):
        result = simulate(cap=5,anchor_unique=94,anchor_count=25,mean_selected=4.8,
                          tokens_per_asin=20124,horizon=7,follow_new_products=False)
        self.assertIsNotNone(result['dayInitialProductFullPassComplete'])
        self.assertGreaterEqual(result['dayInitialProductFullPassComplete'],6669/6048)
        for row in result['snapshots']:
            self.assertLessEqual(row['merchMined'],6669)
            self.assertGreaterEqual(row['merchSeen'],row['merchMined'])
            self.assertLessEqual(row['overdueHeads'],row['keywordHeadsObserved']+1)

    def test_no_autocomplete_geometric_blowup_is_silently_accepted(self):
        with self.assertRaises(ValueError):
            simulate(cap=5,anchor_unique=94,anchor_count=25,mean_selected=4.8,
                     tokens_per_asin=20124,autocomplete_branch=1)


if __name__=='__main__':
    unittest.main()
