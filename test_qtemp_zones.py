"""Deterministic QTemp state zone classification and history checks."""
import unittest
import numpy as np
import pandas as pd
from qtemp_zones import classify, zone_analytics

class QTempZoneTests(unittest.TestCase):
    def test_strict_thresholds(self):
        cases={
          -100:"bottom",-95.01:"bottom",-95:"dca",-90:"dca",-75.01:"dca",
          -75:"neutral",0:"neutral",75:"neutral",75.01:"strong",94.99:"strong",
          95:"boundary",95.01:"overvalued",100:"overvalued"
        }
        for score,expected in cases.items():
            self.assertEqual(classify(score),expected)
    def test_counts_exclude_warmup_and_current_signal_price(self):
        dates=pd.bdate_range("2025-01-02",periods=220)
        score=np.r_[np.full(2,-99.),np.full(50,-96.),np.full(50,-80.),np.full(50,0.),np.full(50,85.),np.full(17,98.),[-98.]]
        frame=pd.DataFrame({"Close":np.linspace(100,300,220)},index=dates)
        values=pd.DataFrame({"QTemp":score,"暫算":[True,True]+[False]*218},index=dates)
        events=pd.DataFrame([{
           "類型":"低估值","確認日":dates[-1],"確認收盤價":300.,
           "暫算":False
        }])
        result=zone_analytics(frame,values,events,10)
        self.assertEqual(result["sample"],218)
        self.assertEqual(sum(z["days"] for z in result["zones"]),218)
        self.assertEqual(sum(y["total"] for y in result["annual"]),218)
        self.assertEqual(sum(result["histogram"]["counts"]),218)
        self.assertEqual(result["current"]["zone"],"bottom")
        self.assertEqual(result["current"]["confirmation"]["confirmedPrice"],300.)
        self.assertEqual(result["current"]["confirmation"]["day"],dates[-1].strftime("%Y-%m-%d"))
    def test_signal_is_not_retroactively_triggered(self):
        dates=pd.bdate_range("2025-01-02",periods=210)
        frame=pd.DataFrame({"Close":np.full(210,50.)},index=dates)
        values=pd.DataFrame({"QTemp":np.full(210,-96.),"暫算":np.zeros(210,dtype=bool)},index=dates)
        events=pd.DataFrame([{"類型":"低估值","確認日":dates[-2],"確認收盤價":50.,"暫算":False}])
        self.assertIsNone(zone_analytics(frame,values,events,10)["current"]["confirmation"])
if __name__=="__main__":
    unittest.main()
