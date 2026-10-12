# Counterledger: for judges

> Exchanges audit themselves. Counterledger lets their users audit them, and cover themselves against them.

**Links:** live site (TODO) · repo https://github.com/rohit-jsfreaky/counterledger · pitch video (TODO, m:ss) · demo video
(TODO, m:ss) · launch post (TODO) · program `5DCUGtXcR4DcBi7FpyRv1fGtUS3zTHJy9kXoDH8yxG9K` (Solana devnet)

**Auth note:** no login needed. Pages that sign transactions offer a built-in demo wallet (a devnet key kept in your
browser) and a faucet for devnet SOL and test-USDC. Proving a balance needs a real CoinDCX account.

## At a glance: criteria → where it lives

| Criterion | Where to look |
|---|---|
| Functionality | `program/` (Anchor, 15 tests), `engine/` (16 tests + `uv run verify`), `web/`; CI on every push |
| Potential impact / market | README → The problem; Nexus Mutual sold $220M of custody cover with no liability data |
| Novelty | The liability side, proven by users with zkTLS and verified inside a Solana program (README → The core loop) |
| UX | `/prove` (3 steps, live receipt), `/cover` (market + ticket), `/board`; demo wallet, no install |
| Open source / composability | public repo; evidence JSON + hashes posted on-chain; anyone can recompute with `uv run verify` |
| Business plan | below → Submission text → Go-to-market |
| Superteam India: ecosystem impact | Solana program + public data any app can read; first proof from an Indian exchange (CoinDCX) |
| Superteam India: PMF / growth | Indian exchanges have no public reserve tracker (WazirX, ZebPay, CoinSwitch, Mudrex); WazirX users lived through a year-long freeze |

| Sponsor / tech | What it does here | File |
|---|---|---|
| Solana | verifies zkTLS claims (secp256k1 + keccak), holds floors, heartbeat, score, cover pools, payouts | `program/programs/counterledger/src/` |
| Reclaim Protocol | zkTLS proof of the balance a user's exchange shows them | `web/src/app/api/reclaim/session/route.ts`, `tools/prove/` |
| Etherscan, TronGrid, NodeReal | hourly withdrawals from exchange wallets | `engine/src/counterledger/{etherscan,tron,bsc}.py` |
| DefiLlama | reserve balances and address lists | `engine/src/counterledger/reserves.py` |
| Binance zkmerkle | inclusion check against Binance's published liability tree | `tools/inclusion/` |

## The verified run (from `evidence/`)

1. **Backtests** (rules pre-registered 10 Oct): FTX alarm **7.9 h before** the first public report; WazirX 6.5 h and
   Bitget 5.9 h after their stated halts. Cover would have paid at T + 37 h, 48 h, 47 h vs Nexus's 100-day rule. 6 normal
   weeks: 1 false alarm (WazirX), 0 false payouts. Files: `evidence/backtests/`.
2. **Reserves** from each exchange's own wallets: $230.4B across 6 exchanges (Binance $172.96B … CoinDCX $184.1M);
   WazirX shown as "—" (no current published address list). Files: `evidence/reserves/`.
3. **A real balance proof** from a CoinDCX account, verified by the program on devnet: bucket < 1 USDT, tx
   `4ycyayVfCm3h…` (`evidence/proofs/`).
4. **Scores posted on devnet** with the sha256 of each score's evidence JSON (`evidence/onchain/reports.json`).
5. **FTX halt replayed end to end on devnet:** cover bought, halt posted with the backtest's evidence hash, challenge
   window passed, 1,000 test-USDC paid (`evidence/onchain/replay-ftx-2022-11-a1.json`).
6. **Inclusion checker:** valid record included; edited balance, wrong index and wrong root rejected
   (`evidence/inclusion/testvectors.json`).
7. **`uv run verify`:** 32/32 PASS.

## 60-second judge path

1. Open `/judges`: the path, devnet ids and the verify lines.
2. Open `/board`: reserves, withdrawals, proven floor and score for 7 exchanges; click CoinDCX.
3. Open `/replay`: the three halts, hour by hour.
4. **Open `/break` and press "Run every attack"**: 7 attacks rejected by the deployed program, 1 honest control accepted.
5. Open `/cover`: connect the demo wallet, get free test-USDC, buy cover.

## What is real and what is demo

- **Real:** exchange addresses and balances (each with a source), on-chain withdrawal flows, the three historical events,
  the CoinDCX proof from a real account, every devnet transaction.
- **Demo:** test-USDC pools, LP and cover positions, the demo wallet, the 120 s challenge window on devnet (24 h in the
  rules).

## What it proves, and what it does not

- **Proves:** a minimum of what an exchange owes, proven by its users; withdrawals against the exchange's own usual
  pattern; inclusion against a tree the exchange published.
- **Does not prove:** total liabilities, solvency, or anything about an exchange nobody has proven against. The score is
  not a solvency rating.

## Known issues

- One real proof so far; the CoinDCX provider proves the first coin in the portfolio only.
- The watcher is a single signer in v1 (evidence hashes + challenge window are the guard).
- Stuck-withdrawal proofs (k = 3 in the cover rules) are not built; devnet payouts use the heartbeat rule alone.
- The inclusion check has not been run on a real Binance user record.
- Binance's live heartbeat leaves out BSC: NodeReal's free monthly quota ran out before its BSC wallets were read; the
  reason is recorded in `evidence/heartbeat/binance.json`.

## Submission text (Colosseum + Superteam Earn)

**Name:** Counterledger

**One line:** The users' side of every exchange's books: users prove what their exchange owes them with zkTLS, and a
Solana market prices and pays out the risk that it can't.

**Brief description:** Exchanges publish what they hold; what they owe users is their own word. Counterledger lets users
prove the balance their exchange shows them with Reclaim zkTLS, verified inside a Solana program, so each exchange gets
a public, user-proven floor of what it owes. A public watcher reads each exchange's own wallets every hour and flags
when withdrawals fall far below their usual pattern; on FTX it fired 7.9 hours before the halt was public. Per-exchange
cover pools on Solana are priced by what is proven and paid by a confirmed halt after a challenge window, not by a vote.
Devnet, test-USDC; a protocol demo, not insurance.

**Blockchains / tools:** Solana (devnet), Anchor, Reclaim Protocol (zkTLS), Etherscan, TronGrid, NodeReal, DefiLlama,
Helius, Binance zkmerkle-proof-of-solvency, Next.js, Python.

**Team:** Rohit (solo), Kolkata, India. Builds browser agents and data pipelines; earlier project Cairn (self-repairing
browser agents).

**Go-to-market:** Indian retail first: most Indian exchanges are on no public reserve tracker, and the WazirX freeze is
recent memory. Proving is free and takes about a minute; the plan is to give provers cheaper cover (not built yet), so
the data pays for itself. Next: funds and OTC desks that already buy counterparty ratings built from exchange-published data. Revenue:
a take rate on cover premiums and a data API.

**Demand validation (honest):** no users yet. The demand signal is that Nexus Mutual sold $220M of custody cover and
retired it because liabilities were unknown; Counterledger supplies exactly that missing data.

**Pre-existing work disclosure:** built from scratch during the hackathon (Sep 14 to Oct 12, 2026). No code reused from
earlier projects. AI pair programming (Claude) was used; commits carry a co-author line.

## Build log

- 10 Oct: idea locked; data probe; watcher and backtests with pre-registered rules; reserves for 6 exchanges.
- 11 Oct: CoinDCX Reclaim provider and first real proof; Anchor program live on devnet with on-chain claim checks,
  floors, reports and cover pools; FTX halt replayed and paid on devnet; Binance inclusion checker; website with demo
  wallet, cover market and live attack simulations; CI green (engine, program, web).
