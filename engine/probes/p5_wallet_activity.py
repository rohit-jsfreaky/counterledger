"""Probe: were the labelled hot wallets active on Ethereum in the day before each event? (outgoing counts)"""
import json
from datetime import datetime, timedelta
from counterledger import etherscan
from counterledger.paths import DATA_DIR

events = json.loads((DATA_DIR / "events.json").read_text())["events"]
out = {}
for ev in events:
    T = datetime.fromisoformat(ev["T"].replace("Z", "+00:00"))
    b0, b1 = etherscan.block_at(T - timedelta(days=8)), etherscan.block_at(T - timedelta(days=7))
    print(f"== {ev['id']} T={ev['T']} blocks {b0}-{b1} (day T-8..T-7)")
    for addr, label in ev["hot_wallets_eth"].items():
        n_out = n_in = 0
        for r in etherscan.normal_txs(addr, b0, b1):
            if r["from"].lower() == addr and int(r["value"]) > 0: n_out += 1
            else: n_in += 1
        t_out = sum(1 for r in etherscan.token_transfers(addr, b0, b1) if r["from"].lower() == addr)
        print(f"   {label:<22} {addr}  eth_out={n_out:>5} token_out={t_out:>5} other_txs={n_in}")
        out[addr] = {"event": ev["id"], "label": label, "eth_out_day": n_out, "token_out_day": t_out}
(DATA_DIR.parent / "evidence" / "probe-wallet-activity.json").write_text(json.dumps(out, indent=1))
