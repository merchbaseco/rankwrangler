import unittest
from model_sync_capacity import closed_workload, frontier, maintenance, queue_days


class CapacityModelTests(unittest.TestCase):
    def test_hot_keywords_need_one_daily_head_each(self):
        self.assertEqual(maintenance(100, hot=1, warm=0), 100)
        self.assertEqual(maintenance(100, pages=3, hot=1, warm=0), 300)

    def test_backlog_cannot_clear_when_maintenance_consumes_capacity(self):
        self.assertIsNone(queue_days(100, 100, 100))
        self.assertIsNone(queue_days(100, 100, 101))
        self.assertEqual(queue_days(100, 100, 50), 2)

    def test_larger_batch_does_not_reduce_ads_or_scan_work(self):
        result = closed_workload(100, 10000, .5, 2)
        self.assertEqual(result['initialPages'], 10000)
        self.assertEqual(result['firstGenerationKeywords'], 5000)
        self.assertEqual(result['approaches'][0]['jevRequests'], 400)
        self.assertEqual(result['approaches'][1]['jevRequests'], 100)
        # Bigger model batches alone leave serial row-write cost intact.
        self.assertAlmostEqual(result['approaches'][0]['assumedCandidateWriteSeconds'], 1400)
        self.assertAlmostEqual(result['approaches'][1]['assumedCandidateWriteSeconds'], 1400)

    def test_queue_cannot_outrun_existing_provider_budget(self):
        result = closed_workload(100, 10000, .5, 2)
        queued = result['approaches'][2]['days'] * 86400
        self.assertGreaterEqual(queued, 10000 / .16)
        self.assertGreaterEqual(queued, 100 * 10)
        self.assertAlmostEqual(result['jevCostDollars'], .064155)

    def test_head_first_defers_depth_without_claiming_it_complete(self):
        result = closed_workload(100, 10000, .5, 10)
        self.assertLess(result['approaches'][3]['days'], result['approaches'][2]['days'])
        self.assertEqual(result['initialPages'], 50000)

    def test_frontier_reproduction_is_not_a_refresh_interval(self):
        self.assertEqual([x['newProducts'] for x in frontier(2, 10)], [10,20,40,80])
        self.assertEqual([x['newProducts'] for x in frontier(.5, 16)], [16,8,4,2])


if __name__ == '__main__':
    unittest.main()
