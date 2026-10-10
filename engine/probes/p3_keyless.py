"""Probe keyless sources: Binance PoR address API, Bybit PoR CSV, Blockstream BTC, public Solana RPC, TronGrid, DefiLlama."""
import json
from counterledger import cache

def show(name, fn):
    try:
        out = fn()
        print(f"OK   {name}: {out}")
    except Exception as e:
        print(f"FAIL {name}: {e.__class__.__name__} {str(e)[:160]}")

def binance():
    r = cache.get_json("https://www.binance.com/bapi/apex/v1/public/apex/market/por/address")
    d = r.get("data") or r
    sample = json.dumps(d)[:400]
    return f"keys={list(r.keys())} sample={sample}"
show("binance por/address", binance)

def bybit():
    for ym in ["202610", "202609", "202608"]:
        try:
            s = cache.get_text(f"https://api2.bybit.com/common-static/por/bybit_por_{ym}.csv")
            if s.startswith("Coin,"):
                lines = s.strip().splitlines()
                return f"{ym}: {len(lines)} rows; header={lines[0]!r}; row1={lines[1][:160]!r}"
        except Exception as e:
            last = e
    raise last
show("bybit por csv", bybit)

show("blockstream btc", lambda: cache.get_json("https://blockstream.info/api/address/34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo"))
show("solana rpc", lambda: cache.post_json("https://api.mainnet-beta.solana.com",
     {"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": ["5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9"]}))
show("trongrid nokey", lambda: str(cache.get_json("https://api.trongrid.io/v1/accounts/TGjpmhAFT6d7eBKvaFwPVN6H2pDKgLLZiw"))[:300])
show("trongrid trc20 history nokey", lambda: len(cache.get_json(
    "https://api.trongrid.io/v1/accounts/TGjpmhAFT6d7eBKvaFwPVN6H2pDKgLLZiw/transactions/trc20", params={"limit": 50})["data"]))
def llama(slug):
    p = cache.get_json(f"https://api.llama.fi/protocol/{slug}")
    tv = p.get("tvl") or []
    return f"tvl points={len(tv)} first={tv[0] if tv else None} last={tv[-1] if tv else None} chains={list((p.get('chainTvls') or {}).keys())[:8]}"
show("llama coindcx", lambda: llama("coindcx"))
show("llama bitget", lambda: llama("bitget"))
show("llama prices hist", lambda: cache.get_json("https://coins.llama.fi/prices/historical/1667865600/coingecko:bitcoin,coingecko:ethereum"))
