"""Deterministic seven-zone, high-risk and empirical percentile regression tests.

Fixture prices are test data only; none appear as public market prices.
"""
import unittest
import numpy as np
import pandas as pd
from unittest.mock import patch
from qtemp_zones import (
    classify, classify_percentile, zone_analytics, _episodes, site_zones
)

class QTempZoneTests(unittest.TestCase):
    def fixture(self, scores, warmup=None, start="2025-01-02"):
        d=pd.bdate_range(start,periods=len(scores))
        frame=pd.DataFrame({"Close":np.linspace(100,130,len(d))},index=d)
        values=pd.DataFrame({"QTemp":scores,"暫算":warmup if warmup is not None else [False]*len(d)},index=d)
        events=pd.DataFrame(columns=["類型","確認日","暫算"])
        return frame,values,events

    def test_strict_seven_zone_boundaries(self):
        cases={
            -100:"extreme_low",-95.001:"extreme_low",
            -95:"undervalued",-75.001:"undervalued",
            -75:"weak",-35.001:"weak",
            -35:"neutral",0:"neutral",35:"neutral",
            35.001:"strong",75:"strong",
            75.001:"overvalued",94.999:"overvalued",
            95:"extreme_high",99.999:"extreme_high",100:"extreme_high"
        }
        for value,key in cases.items():
            with self.subTest(value=value):
                self.assertEqual(classify(value),key)
        with self.assertRaises(ValueError):classify(np.nan)

    def test_mutual_exclusivity_and_no_double_count_at_100(self):
        scores=[-100,-95,-75,-35,35,75,75.01,95,100,100,0]
        frame,values,events=self.fixture(scores)
        result=zone_analytics(frame,values,events,10)
        self.assertEqual(len(result["zones"]),7)
        self.assertEqual(sum(z["days"] for z in result["zones"]),len(scores))
        self.assertAlmostEqual(sum(z["percent"] for z in result["zones"]),100,places=9)
        self.assertEqual(sum(y["total"] for y in result["annual"]),len(scores))
        self.assertEqual(sum(result["histogram"]["counts"]),len(scores))
        self.assertEqual(result["highRisk"]["exact100Days"],2)
        self.assertAlmostEqual(result["highRisk"]["exact100Percent"],200/len(scores))
        self.assertEqual(next(z["days"] for z in result["zones"] if z["key"]=="extreme_high"),3)
        self.assertEqual(result["current"]["zone"],"neutral")
        self.assertFalse(result["current"]["highRisk100"])

    def test_hundred_current_warning_is_overlay_not_eighth_band(self):
        frame,values,events=self.fixture([98,99.9,100.])
        result=zone_analytics(frame,values,events)
        self.assertEqual(result["current"]["label"],"極端高估")
        self.assertTrue(result["current"]["highRisk100"])
        self.assertEqual(result["highRisk"]["exact100Days"],1)
        self.assertEqual(len(result["zones"]),7)
        self.assertEqual(sum(z["days"] for z in result["zones"]),3)

    def test_streaks_entries_average_longest_and_invalid_gap(self):
        # Segment: low(low,low), neutral, low(low), gap(warmup), low
        frame,values,events=self.fixture([-99,-99,0,-99,-99,-99,-99],
                                         [False,False,False,False,False,True,False])
        result=zone_analytics(frame,values,events)
        low=next(z for z in result["zones"] if z["key"]=="extreme_low")
        self.assertEqual(low["days"],5)
        self.assertEqual(low["entries"],3)
        self.assertAlmostEqual(low["averageDays"],5/3)
        self.assertEqual(low["longestDays"],2)
        self.assertEqual(low["ongoingDays"],1)
        self.assertEqual(result["totalWarmupExcluded"],1)

    def test_confirmed_bottom_reference_price_not_retroactive(self):
        frame,values,events=self.fixture([-98]*30)
        events=pd.DataFrame([{"類型":"低估值","確認日":frame.index[-1],"暫算":False}])
        result=zone_analytics(frame,values,events)
        self.assertEqual(result["current"]["confirmation"]["confirmedPrice"],130.)
        events.iloc[0,events.columns.get_loc("確認日")]=frame.index[-2]
        self.assertIsNone(zone_analytics(frame,values,events)["current"]["confirmation"])

    def test_percentile_ties_are_not_split_across_bins(self):
        frame,values,events=self.fixture([10.]*10+[20.]*10)
        result=zone_analytics(frame,values,events,10,"percentile")
        by_key={z["key"]:z for z in result["zones"]}
        self.assertEqual(sum(z["days"] for z in result["zones"]),20)
        self.assertAlmostEqual(sum(z["percent"] for z in result["zones"]),100)
        self.assertEqual(sum(z["days"] for z in result["zones"] if z["days"]),20)
        self.assertEqual(by_key["p2"]["days"],10)  # 10-score percentile 27.5
        self.assertEqual(by_key["p4"]["days"],10)  # 20-score percentile 77.5
        self.assertEqual(result["current"]["zone"],"p4")
        self.assertAlmostEqual(result["current"]["percentile"],77.5)
        self.assertEqual(result["highRisk"]["exact100Days"],0)

    def test_recent_excluded_warmup_does_not_change_confirmed_current_state(self):
        frame,values,events=self.fixture([-96,-97,100],[False,False,True])
        result=zone_analytics(frame,values,events,1,"fixed")
        self.assertEqual(result["sample"],2)
        self.assertEqual(result["current"]["score"],-97)
        self.assertEqual(result["current"]["zone"],"extreme_low")
        self.assertFalse(result["current"]["highRisk100"])
        self.assertEqual(result["end"],frame.index[-2].strftime("%Y-%m-%d"))
        self.assertEqual(sum(y["total"] for y in result["annual"]),2)

    def test_percentile_annual_and_entry_counts_are_mutually_exclusive(self):
        frame,values,events=self.fixture([0,5,10,15,20,25,30,35,40,45,50,100])
        result=zone_analytics(frame,values,events,10,"percentile")
        self.assertEqual(len(result["zones"]),7)
        self.assertEqual(sum(z["days"] for z in result["zones"]),result["sample"])
        self.assertAlmostEqual(sum(z["percent"] for z in result["zones"]),100,places=9)
        self.assertEqual(sum(y["total"] for y in result["annual"]),result["sample"])
        self.assertEqual(result["highRisk"]["exact100Days"],1)
        self.assertEqual(sum(z["entries"] for z in result["zones"]),6)  # Six consecutive percentile bands are occupied.

    def test_period_filters_and_all(self):
        d=pd.bdate_range("2010-01-01","2026-11-16")
        frame=pd.DataFrame({"Close":np.ones(len(d))},index=d)
        values=pd.DataFrame({"QTemp":np.linspace(-100,100,len(d)),"暫算":False},index=d)
        events=pd.DataFrame(columns=["類型","確認日","暫算"])
        all_result=zone_analytics(frame,values,events,None)
        one=zone_analytics(frame,values,events,1)
        fifteen=zone_analytics(frame,values,events,15)
        self.assertGreater(all_result["sample"],fifteen["sample"])
        self.assertGreater(fifteen["sample"],one["sample"])
        self.assertEqual(sum(z["days"] for z in one["zones"]),one["sample"])
        self.assertEqual(sum(z["days"] for z in fifteen["zones"]),fifteen["sample"])
        self.assertEqual(sum(z["days"] for z in all_result["zones"]),all_result["sample"])

    def test_percentile_boundary_values_exclusive(self):
        cases={0:"p0",4.999:"p0",5:"p1",19.999:"p1",20:"p2",40:"p3",
               60:"p3",60.001:"p4",80:"p4",80.001:"p5",95:"p5",95.001:"p6",100:"p6"}
        for score,key in cases.items():
            self.assertEqual(classify_percentile(score),key)

    def test_site_validation_and_legacy_api_signature(self):
        with self.assertRaises(ValueError):site_zones("SPY","20y","fixed")
        with self.assertRaises(ValueError):site_zones("SPY","10y","nonsense")
        # Legacy zone_analytics(frame, values, events, 10) remains valid.
        frame,values,events=self.fixture([0,5,10])
        self.assertEqual(zone_analytics(frame,values,events,10)["sample"],3)

if __name__=="__main__":unittest.main()
