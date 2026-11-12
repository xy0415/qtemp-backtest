"""Deterministic checks: QTemp event-study, calendar and quality audit."""
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
import research_insights


class ResearchInsightTests(unittest.TestCase):
    def setUp(self):
        self.dates=pd.bdate_range("2021-01-04",periods=350)
        self.price=pd.Series(80+np.arange(350)*.35,index=self.dates)
        self.frame=pd.DataFrame({
            "Open":self.price,"High":self.price+1,"Low":self.price-1,
            "Close":self.price,"Adj Close":self.price,"Volume":np.full(350,1000.)
        },index=self.dates)
        self.values=pd.DataFrame({"QTemp":np.linspace(-100,100,350),
            "暫算":np.zeros(350,dtype=bool)},index=self.dates)
        self.events=pd.DataFrame({
            "類型":["低估值","低估值","底背離","高估值"],
            "確認位置":[60,70,130,340],
            "確認日":[self.dates[i] for i in (60,70,130,340)],
            "暫算":[False,False,False,True]
        })
    def test_confirmed_event_study_and_trailing_exclusion(self):
        study=research_insights._event_study(self.frame,self.events)
        g=study["groups"]["低估值"]
        self.assertEqual(g["sample"],2)
        self.assertEqual(g["excluded"],0)
        self.assertEqual(g["points"][4]["day"],0)
        self.assertAlmostEqual(g["points"][4]["mean"],0.)
        self.assertEqual(study["groups"]["高估值"]["sample"],0)
    def test_calendar_confirmed_only(self):
        calendar=research_insights._calendar(self.events,self.frame)
        self.assertEqual(len(calendar),3)
        self.assertTrue(all("高估值" not in item["signals"] for item in calendar))
    def test_quality_samples_and_missing_day_method(self):
        with patch.object(research_insights,"_market_sessions",
            return_value=(self.dates, "測試交易所日曆")):
            q=research_insights._audit("SPY",self.frame,self.values,self.events,
                "America/New_York",{"_qtemp_cache_status":"verified_cache"})
        self.assertEqual(q["bars"],350)
        self.assertEqual(q["qtempSamples"],350)
        self.assertEqual(q["missingSessions"],0)
        self.assertEqual(q["dataStatus"],"verified_cache")
    def test_site_api_offline(self):
        with patch.object(research_insights,"snapshot",
              return_value=("SPY",self.frame,self.values,self.events)), \
             patch("qtemp_core.load_market",
              return_value=("SPY",self.frame,{},"America/New_York")), \
             patch.object(research_insights,"_market_sessions",
              return_value=(self.dates,"測試交易所日曆")):
            result=research_insights.site_research("SPY")
        self.assertEqual(result["symbol"],"SPY")
        self.assertIn("calendar",result)
        self.assertIn("eventStudy",result)
        self.assertIn("quality",result)

if __name__=="__main__":
    unittest.main()
