"""Daily confirmed-close QTemp alert to Discord. Configure DISCORD_WEBHOOK_URL GitHub secret."""
import json
import os
import re
import urllib.request
from datetime import datetime, timezone, timedelta
import pandas as pd
from qtemp_core import load_market, apply_price_basis, qtemp

def main():
    webhook=os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook.startswith("https://discord.com/api/webhooks/"):
        print("Discord webhook secret is unset; notifications are disabled.")
        return
    with open("alert_watchlist.json",encoding="utf-8") as f:
        conf=json.load(f)
    symbols=list(dict.fromkeys(str(s).strip().upper() for s in conf.get("symbols",[])))[:12]
    allowed=set(conf.get("signals",["低估值","底背離"]))
    messages=[]
    for ticker in symbols:
        if not re.fullmatch(r"[A-Z0-9.^=_-]{1,30}",ticker):
            continue
        try:
            symbol,raw,meta,zone=load_market(ticker)
            frame=apply_price_basis(raw)
            _,events=qtemp(frame,tick=10**(-int(meta.get("priceHint") or 2)))
            last=frame.index[-1]
            # Scheduled Sunday UTC run covers Friday US/TW trading sessions;
            # other runs require a recently closed trading date, to avoid
            # repeated holiday/weekend notifications for an old signal.
            utc_today=datetime.now(timezone.utc).date()
            max_age=3 if utc_today.weekday()==6 else 2
            if (utc_today-last.date()).days > max_age:
                print(symbol,"no fresh confirmed session",last.date().isoformat())
                continue
            selected=events.loc[
                events["確認日"].eq(last) & events["類型"].isin(allowed)
            ].drop_duplicates(["類型","確認日"])
            for _,event in selected.iterrows():
                messages.append(f"{symbol}｜{event['類型']}｜確認日 {last.date().isoformat()}｜還原收盤 {float(event['確認收盤價']):,.4f}")
            print(symbol,"日K",last.date().isoformat(),"訊號",len(selected))
        except Exception as e:
            print("查詢失敗",ticker,str(e)[:120])
    if not messages:
        print("No newly confirmed QTemp alerts. Nothing sent.")
        return
    body={"content":"**QTemp 已確認日K訊號**\n"+"\n".join(messages)+"\n僅供技術研究，非投資建議。"}
    req=urllib.request.Request(webhook,data=json.dumps(body,ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type":"application/json","User-Agent":"QTempBot/1.0"},method="POST")
    with urllib.request.urlopen(req,timeout=20) as response:
        print("Discord send status:",response.status)

if __name__=="__main__":
    main()
