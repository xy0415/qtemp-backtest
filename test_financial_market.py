"""Offline market-portal regression checks.

Only deterministic fixture market data is used in tests. Production never displays this fixture.
"""
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np
import financial_market as fm
from app import app

class MarketPortalTests(unittest.TestCase):
    def test_sox_is_a_true_index_not_soxx_etf(self):
        entry=next(x for x in fm.INDEXES if x[0]=="^SOX")
        self.assertEqual(entry[1],"費城半導體 SOX")
        self.assertIn(("SOXX","半導體","US","產業 ETF"),fm.SECTORS)
        self.assertNotEqual(entry[0],"SOXX")
    def test_market_items_keep_no_fabricated_failures(self):
        with patch("financial_market._history",side_effect=RuntimeError("blocked")):
            result=fm._entry(("^SOX","費城半導體 SOX","US","半導體"))
        self.assertIsNone(result.get("value"))
        self.assertIn("error",result)
    def test_daily_close_and_change_are_observed(self):
        dates=pd.bdate_range("2026-11-10",periods=3)
        prices=pd.Series([100.,104.,102.],index=dates)
        with patch("financial_market._history",return_value=prices):
            data=fm._entry(("^SOX","費城半導體 SOX","US","半導體"))
        self.assertEqual(data["asOf"],dates[-1].strftime("%Y-%m-%d"))
        self.assertEqual(data["value"],102.)
        self.assertAlmostEqual(data["changePct"],-100*(2/104),places=5)
        self.assertEqual(data["series"][-1][1],102.)
    def test_macro_is_not_presented_as_official_cpi(self):
        text=fm.macro_snapshot.__doc__ or ""
        self.assertIn("not fabricated",text)
    def test_quote_routes_and_parameters(self):
        client=app.test_client()
        self.assertEqual(client.get("/health").status_code,200)
        self.assertEqual(client.get("/financial_portal.js").status_code,200)
        self.assertEqual(client.get("/financial_portal.css").status_code,200)
        self.assertEqual(client.get("/api/market/history/NOT_A_REAL_SYMBOL").status_code,400)
        self.assertEqual(client.get("/api/market/history/%5ESOX?period=unlimited").status_code,400)
    def test_pages_are_real_routes(self):
        js=open("platform_navigation.js",encoding="utf8").read()
        for route in ("overview","markets","macro","sectors","stocks","news","quant","watchlist"):
            self.assertIn("['"+route+"'",js)
        self.assertIn("qtemp-route-change",js)

if __name__=="__main__":
    unittest.main()
