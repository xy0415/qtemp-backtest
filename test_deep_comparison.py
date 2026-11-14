"""Offline deterministic deep comparison tests; synthetic series are test fixtures only."""
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
from deep_comparison import compare_deep, _portfolio, _max_dd_stats

class DeepComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.days=pd.bdate_range("2010-01-04",periods=4200)
        cls.data={}
        for i,symbol in enumerate(["SOXL","MRVL","COHR","SPY","QQQ","SOXX"]):
            x=np.arange(len(cls.days),dtype=float)
            # Positive deterministic historical shape, never sent as real market output.
            close=pd.Series((80.+8*i)*np.exp((.0003+i*.000035)*x + .12*np.sin(x/(85+i*6))),
                index=cls.days,name="Close")
            frame=pd.DataFrame({"Close":close},index=cls.days)
            values=pd.DataFrame({"QTemp":-85.+np.sin(x/23)*10.},index=cls.days)
            cls.data[symbol]=(symbol,frame,values,pd.DataFrame())
    @classmethod
    def snapshot(cls,symbol,slot):
        return cls.data[symbol]
    def test_range_and_metrics(self):
        with patch("deep_comparison.snapshot",side_effect=self.snapshot):
            result=compare_deep("SOXL,MRVL,COHR","SPY","10y","","","50,25,25","quarterly")
        self.assertTrue(result["commonDays"]>2000)
        self.assertEqual(result["symbols"],["SOXL","MRVL","COHR"])
        self.assertEqual(len(result["correlations"]),3)
        self.assertEqual(len(result["rollingCorrelations"]),3)
        self.assertAlmostEqual(sum(result["portfolio"]["weights"].values()),100,places=5)
        self.assertGreater(result["portfolio"]["rebalanceCount"],0)
        for item in result["assets"]:
            self.assertAlmostEqual(item["nav"][0][1],100.,places=5)
            self.assertIn("sharpe",item["metrics"])
            self.assertIn("sortino",item["metrics"])
            self.assertIn("calmar",item["metrics"])
            self.assertIn("maxUnderwaterDays",item["metrics"])
            self.assertIn("beta",item["metrics"])
    def test_longest_window(self):
        with patch("deep_comparison.snapshot",side_effect=self.snapshot):
            year=compare_deep("SOXL,MRVL","QQQ","1y","","","","none")
            whole=compare_deep("SOXL,MRVL","QQQ","all","","","","none")
        self.assertGreater(whole["commonDays"],year["commonDays"])
        self.assertGreater(whole["commonDays"],3000)
        self.assertEqual(whole["commonStart"],self.days[0].date().isoformat())
    def test_custom_dates_validation(self):
        with patch("deep_comparison.snapshot",side_effect=self.snapshot):
            with self.assertRaisesRegex(ValueError,"結束日期"):
                compare_deep("SOXL,MRVL","SPY","custom","2025-01-01","2021-01-01","","none")
            custom=compare_deep("SOXL,MRVL","SPY","custom","2015-03-01","2018-03-30","","none")
        self.assertGreater(custom["commonDays"],700)
        self.assertEqual(custom["commonStart"],"2015-03-02")
    def test_common_dates_no_forward_fill(self):
        base=self.days
        sample_data=dict(self.data)
        a,b,c,_=sample_data["MRVL"]
        alternate=b.loc[b.index.dayofweek!=2]
        sample_data["MRVL"]=(a,alternate,c.loc[alternate.index],pd.DataFrame())
        with patch("deep_comparison.snapshot",side_effect=lambda s,slot:sample_data[s]):
            result=compare_deep("SOXL,MRVL","SPY","1y","","","","none")
        self.assertTrue(result["commonDays"]<220)
    def test_buy_and_hold_weight_preservation(self):
        dates=pd.bdate_range("2026-01-01",periods=3)
        prices=pd.DataFrame({"A":[100,200,200],"B":[100,100,100]},index=dates)
        hold,count=_portfolio(prices,[50,50],"none")
        self.assertEqual(count,0)
        self.assertAlmostEqual(hold.iloc[0],100)
        self.assertAlmostEqual(hold.iloc[-1],150)
    def test_unrecovered_drawdown(self):
        series=pd.Series([100,120,60,80],index=pd.bdate_range("2026-01-01",periods=4))
        mdd,longest,recovery,_=_max_dd_stats(series)
        self.assertAlmostEqual(mdd,-.5)
        self.assertEqual(longest,2)
        self.assertIsNone(recovery)

if __name__=="__main__":unittest.main()
