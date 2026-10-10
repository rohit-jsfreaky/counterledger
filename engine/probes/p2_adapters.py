"""Probe: fetch DefiLlama adapter source for each exchange; count addresses per chain."""
import re
from counterledger import cache

BASE = "https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/main/projects/"
for mod in ["binance", "coindcx", "bitget", "bybit", "okex", "kucoin", "ftx", "wazirx"]:
    try:
        src = cache.get_text(BASE + mod + "/index.js")
    except Exception as e:
        print(f"== {mod}: {e.__class__.__name__} {str(e)[:80]}")
        continue
    print(f"== {mod}: {len(src)} chars")
    # chains are object keys followed by owners arrays
    for m in re.finditer(r"(\w+)\s*:\s*\{\s*owners\s*:\s*\[(.*?)\]", src, re.S):
        addrs = re.findall(r"['\"]([^'\"]{20,})['\"]", m.group(2))
        print(f"   {m.group(1):<12} {len(addrs)}")
    if "owners" not in src:
        print(src[:600])
