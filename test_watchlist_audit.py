"""Regression coverage for confirmed watchlist alerts and worker health labels."""
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
from research_features import scan
from app import app

class WatchlistAndMonitorTests(unittest.TestCase):
    def setUp(self):
        dates=pd.bdate_range("2026-01-02",periods=90)
        self.dates=dates
        self.frame=pd.DataFrame({"Close":np.full(len(dates),100.)},index=dates)
        self.values=pd.DataFrame({"QTemp":np.full(len(dates),-96.)},index=dates)
    def event(self,warmup):
        return pd.DataFrame({
            "確認日":[self.dates[-5],self.dates[-1]],
            "類型":["低估值","底背離"],
            "暫算":[False,warmup]
        })
    def test_warmup_event_is_not_a_confirmed_today_alert(self):
        with patch("research_features.snapshot",return_value=("SPY",self.frame,self.values,self.event(True))):
            result=scan("SPY")["items"][0]
        self.assertFalse(result["newConfirmedToday"])
        self.assertEqual(result["signalDate"],self.dates[-5].date().isoformat())
        self.assertLess(result["score"],-90)
    def test_same_day_confirmed_event_has_explicit_flag(self):
        with patch("research_features.snapshot",return_value=("SPY",self.frame,self.values,self.event(False))):
            result=scan("SPY")["items"][0]
        self.assertTrue(result["newConfirmedToday"])
        self.assertEqual(result["signalDate"],result["end"])
    def test_diagnostics_scope_is_worker_only(self):
        res=app.test_client().get("/api/diagnostics")
        self.assertEqual(res.status_code,200)
        self.assertEqual(res.json["scope"],"single_worker_since_start")
        self.assertIn("uptimeSeconds",res.json)

if __name__=="__main__":
    unittest.main()
