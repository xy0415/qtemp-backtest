import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd

from app import app
from market_rankings import rankings
from rti import calculate, calibration, earnings_reference


def sample(n=760):
    i=np.arange(n)
    close=100 + i*.04 + np.sin(i/12)*9
    return pd.DataFrame(
        dict(Open=close*.999,High=close*1.01,Low=close*.99,Close=close,Volume=2000+(i%14)*20),
        index=pd.bdate_range('2021-01-01',periods=n),
    )


class RTITests(unittest.TestCase):
    def test_rank_cutoffs(self):
        self.assertAlmostEqual(calibration(.05),-100)
        self.assertAlmostEqual(calibration(.5),0)
        self.assertAlmostEqual(calibration(.95),100)

    def test_default_rti_warmup_and_prefix_causality(self):
        prices=sample()
        all_rows, annual, divs=calculate(prices,504,126)
        prefix, _, _=calculate(prices.iloc[:600],504,126)
        self.assertEqual(all_rows[:600],prefix)
        self.assertEqual(all_rows[0]['stage'],'none')
        self.assertFalse(any(row['stage']=='formal' for row in all_rows[:199]))
        self.assertEqual(all_rows[-1]['stage'],'formal')
        self.assertEqual(sum(row['buyCount']+row['sellCount'] for row in annual),
                         sum(row['entry'] is not None for row in all_rows))
        self.assertEqual(divs,[])

    def test_missing_volume_prevents_formal_phase(self):
        prices=sample()
        prices['Volume']=np.nan
        rows, _, _=calculate(prices,504,126)
        self.assertTrue(all(row['stage']!='formal' for row in rows))

    def test_eps_uses_previous_session(self):
        prices=sample()
        last=prices.index[-1]
        valid={last-pd.Timedelta(days=90*i): 2.0 for i in range(1,5)}
        now=earnings_reference(prices,{**valid,last:100.0})
        older=earnings_reference(prices,valid)
        self.assertEqual(now,older)
        self.assertAlmostEqual(now['value'],prices.Close.iloc[-2]/8.)

    def test_rankings_sort_and_reuse_last_valid_snapshot(self):
        items=[dict(ticker=str(i),marketCap=i) for i in range(1,13)]
        with patch('market_rankings._cache',{}):
            with patch('market_rankings._equities',return_value=('fixture',items)):
                first=rankings('tw')
            self.assertEqual([row['marketCap'] for row in first['items']],list(range(12,2,-1)))
            with patch('market_rankings.monotonic',return_value=10**14), patch('market_rankings._equities',side_effect=ValueError):
                cached=rankings('tw')
            self.assertTrue(cached['stale'])
            self.assertEqual(cached['items'],first['items'])

    def test_routes_validate_market_and_rti(self):
        client=app.test_client()
        with client.get('/') as page:
            self.assertIn('RTI 市場終端',page.text)
        self.assertEqual(client.get('/api/market/rankings/fx').status_code,404)
        self.assertEqual(client.get('/api/rti/%5ETNX').status_code,400)
        self.assertEqual(client.get('/api/rti/BTC-USD?rank=20').status_code,400)
