"""Financial regression checks for calendar-year coverage and cash flow timing."""
import unittest
import numpy as np
import pandas as pd
from deep_comparison import _yearly, _perf
from capital_backtest import _time_weighted_period_return

class FinanceAuditTests(unittest.TestCase):
    def test_partial_year_never_used_as_best_full_year(self):
        dt=pd.bdate_range("2020-01-15","2021-12-30")
        nav=pd.Series(np.linspace(100,180,len(dt)),index=dt)
        annual=_yearly(nav)
        self.assertTrue(annual[0]["partial"])
        self.assertFalse(annual[1]["partial"])
        perf,_=_perf(nav)
        self.assertAlmostEqual(perf["bestYear"],annual[1]["return"])
    def test_only_partial_year_returns_na(self):
        dates=pd.bdate_range("2025-02-05","2025-10-20")
        nav=pd.Series(np.linspace(100,120,len(dates)),index=dates)
        perf,_=_perf(nav)
        self.assertIsNone(perf["bestYear"])
        self.assertIsNone(perf["worstYear"])
    def test_cash_flow_timing(self):
        # A $100 position increases 10%, while a separate $100 deposits at close:
        # TWR must remain 10%, not 5%.
        self.assertAlmostEqual(_time_weighted_period_return(100,110,0,100),.10)
        # $100 deposit at open buys a position that rises from $100 to $110:
        self.assertAlmostEqual(_time_weighted_period_return(100,220,100,0),.10)
        self.assertEqual(_time_weighted_period_return(0,100,0,100),0.)
    def test_no_future_cash_at_close(self):
        self.assertAlmostEqual(_time_weighted_period_return(100,95,0,100),-.05)

if __name__=="__main__":
    unittest.main()
