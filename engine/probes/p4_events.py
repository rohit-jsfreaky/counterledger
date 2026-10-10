"""Probe: primary-source pages for each backtest event; print timing sentences + addresses."""
import re, html
from counterledger import cache

PAGES = {
    "wazirx-daywise": "https://wazirx.com/blog/wazirx-cyber-attack-day-wise-report/",
    "wazirx-insights": "https://wazirx.com/blog/wazirx-cyber-attack-key-insights-and-learnings/",
    "bitget-own": "https://www.bitget.com/academy/bitget-security-incident-what-happened-timeline-impact-response",
    "ftx-coindesk": "https://www.coindesk.com/business/2022/11/08/ftx-exchange-halts-all-crypto-withdrawals",
}
ADDR = r"\b(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[a-z0-9]{20,60})\b"
KEY = re.compile(r"(withdraw|paus|halt|suspend|UTC|IST|GMT|multisig|hot wallet|resum)", re.I)
for name, url in PAGES.items():
    try:
        s = cache.get_text(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36"})
    except Exception as e:
        print(f"## {name}: FAIL {str(e)[:100]}"); continue
    addrs = sorted(set(re.findall(ADDR, s)))
    txt = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    txt = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", txt)))
    sents = [x.strip() for x in re.split(r"(?<=[.!?])\s+", txt) if KEY.search(x) and 30 < len(x) < 400]
    print(f"## {name}: {len(s)} chars, addrs={addrs}")
    for x in sents[:18]:
        print("   -", x)
