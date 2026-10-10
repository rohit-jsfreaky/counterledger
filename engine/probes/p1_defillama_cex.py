"""Probe: which exchanges DefiLlama tracks as CEX, and the adapter file holding their addresses."""
import json
from counterledger import cache

protos = cache.get_json("https://api.llama.fi/protocols")
cex = [p for p in protos if p.get("category") == "CEX"]
print("CEX entries:", len(cex))
want = ["binance", "bybit", "okx", "kucoin", "bitget", "wazirx", "coindcx", "ftx", "gate", "htx", "mexc", "crypto.com", "kraken", "coinbase", "bitfinex", "zebpay", "coinswitch", "mudrex"]
for p in sorted(cex, key=lambda p: -(p.get("tvl") or 0)):
    n = p["name"].lower()
    if any(w in n for w in want):
        print(f'{p["name"]:<22} slug={p.get("slug"):<20} module={p.get("module")}  tvl={p.get("tvl") and round(p["tvl"]/1e9,2)}B chains={len(p.get("chains",[]))}')
