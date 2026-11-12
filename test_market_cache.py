"""Market backup validation without making any Yahoo request."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
import numpy as np
import pandas as pd
import market_cache


class CacheTests(TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory()
        self.original=market_cache.ROOT
        market_cache.ROOT=Path(self.temp.name)
        dates=pd.bdate_range("2025-01-01",periods=45)
        self.frame=pd.DataFrame({
            "Open":np.full(45,100.),
            "High":np.full(45,101.),
            "Low":np.full(45,99.),
            "Close":np.full(45,100.),
            "Adj Close":np.full(45,99.7),
            "Volume":np.full(45,1000.),
            "Dividends":np.zeros(45),
            "Stock Splits":np.zeros(45)
        },index=dates)
    def tearDown(self):
        market_cache.ROOT=self.original
        self.temp.cleanup()
    def test_verified_serialization_and_provenance(self):
        market_cache.save_verified("SPY",self.frame,{"priceHint":2},"America/New_York")
        loaded=market_cache.load_verified("SPY")
        self.assertIsNotNone(loaded)
        frame,meta,zone=loaded
        self.assertEqual(meta["_qtemp_cache_status"],"verified_cache")
        self.assertEqual(zone,"America/New_York")
        self.assertEqual(len(frame),45)
        self.assertAlmostEqual(frame["Adj Close"].iloc[0],99.7)
        self.assertIsNone(market_cache.load_verified("QQQ"))
    def test_yahoo_failure_uses_verified_backup_with_stale_flag(self):
        import qtemp_core
        qtemp_core.yahoo_history.cache_clear()
        from unittest.mock import patch
        meta={"_qtemp_cache_status":"stale_backup","_qtemp_cache_saved_at":"2026-11-11T00:00:00+00:00"}
        backup=(self.frame,meta,"America/New_York")
        with patch("market_cache.load_verified",side_effect=[None,backup]), \
             patch("qtemp_core._download_yahoo_history",side_effect=RuntimeError("429")), \
             patch("time.sleep",return_value=None):
            frame,info,zone=qtemp_core.yahoo_history("SPY",123456789)
        self.assertEqual(info["_qtemp_cache_status"],"stale_backup")
        self.assertEqual(len(frame),45)
        qtemp_core.yahoo_history.cache_clear()

    def test_corruption_is_never_used(self):
        market_cache.save_verified("SPY",self.frame,{},"America/New_York")
        path=market_cache._path("SPY")
        obj=json.loads(path.read_text())
        obj["rows"][4][0]=-25
        path.write_text(json.dumps(obj))
        self.assertIsNone(market_cache.load_verified("SPY",backup=True))

if __name__=="__main__":
    main()
