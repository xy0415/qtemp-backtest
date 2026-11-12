"""Offline deterministic smoke tests for long-term capital comparison."""
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd

import capital_backtest


class CapitalBacktestTest(unittest.TestCase):
    def setUp(self):
        self.days = pd.bdate_range("2010-01-04", "2013-12-31")
        self.frame = pd.DataFrame({
            "Open": np.full(len(self.days), 100.0),
            "High": np.full(len(self.days), 100.0),
            "Low": np.full(len(self.days), 100.0),
            "Close": np.full(len(self.days), 100.0),
        }, index=self.days)
        self.values = pd.DataFrame({"QTemp": np.full(len(self.days), -20.0)}, index=self.days)
        # A last-day signal must NOT enter. A warmup signal must NOT enter.
        positions=[10, 100, 500, 600, len(self.days)-1]
        self.events = pd.DataFrame({
            "類型": ["低估值"]*5,
            "確認日": [self.days[i] for i in positions],
            "確認位置": positions,
            "暫算": [False,False,False,True,False]
        })
        self.mock = patch("capital_backtest.snapshot",
            return_value=("SPY",self.frame,self.values,self.events))
        self.mock.start()

    def tearDown(self):
        self.mock.stop()

    def run_backtest(self, timing="end", lump="match_dca"):
        return capital_backtest.capital_comparison(
            "SPY","2010-01-01","2013-12-31",
            "1000","100","monthly","500",timing,lump)

    def test_flat_prices_and_equal_budget(self):
        r=self.run_backtest()
        qt,dca,ls=r["strategies"]
        self.assertEqual(r["days"],len(self.days))
        self.assertEqual(qt["purchaseCount"],4)  # IA + 3 confirmed signals
        self.assertEqual(qt["invested"],2500.0)
        self.assertAlmostEqual(dca["invested"],ls["invested"])
        self.assertGreater(dca["purchaseCount"],40)
        self.assertEqual(ls["purchaseCount"],1)
        for s in r["strategies"]:
            self.assertAlmostEqual(s["wealth"],s["invested"],places=6)
            self.assertAlmostEqual(s["return"],0.,places=6)
            self.assertAlmostEqual(s["maxDrawdown"],0.,places=6)
            self.assertIsNotNone(s["xirr"])
            self.assertAlmostEqual(s["xirr"],0.,places=6)

    def test_initial_only_lump(self):
        r=self.run_backtest("begin","initial_only")
        self.assertEqual(r["strategies"][2]["invested"],1000.)
        self.assertGreater(r["strategies"][1]["invested"],1000.)

    def test_dca_periods_begin_and_end(self):
        beginning=self.run_backtest("begin")
        end=self.run_backtest("end")
        self.assertGreater(beginning["strategies"][1]["purchaseCount"],40)
        self.assertGreater(end["strategies"][1]["purchaseCount"],40)
        self.assertEqual(beginning["strategies"][1]["invested"],end["strategies"][1]["invested"])

    def test_invalid_dates(self):
        with self.assertRaises(ValueError):
            capital_backtest.capital_comparison(
                "SPY","2013-12-30","2010-01-01",
                "1000","100","monthly","500","end","match_dca")

    def test_no_listing_data_before_requested_start(self):
        with self.assertRaisesRegex(ValueError, "此標的資料從"):
            capital_backtest.capital_comparison(
                "SPY","2005-01-01","2013-12-31",
                "1000","100","monthly","500","end","match_dca")


if __name__=="__main__":
    unittest.main()
