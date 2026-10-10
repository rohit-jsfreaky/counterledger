# Counterledger — for judges

> Exchanges audit themselves. Counterledger lets their users audit them — and insure against them.

Links (fill at ship time): live · repo · pitch video (m:ss) · demo video (m:ss) · launch post · devnet program id

## At a glance — criteria → files (fill as built)

| criterion | where it lives |
|---|---|
| Functionality | `program/`, `engine/`, `web/`; `verify` output |
| Potential impact / market | README "The problem", "Business" |
| Novelty | README "The insight" (the liability side, user-proven) |
| UX | `/board`, `/prove`, `/cover` |
| Open source / composability | public repo; Reclaim verifier CPI; evidence JSON schema |
| Business plan | README "Business" |
| Superteam India: ecosystem impact · PMF · growth | README "Why India first" |

## The verified run (numbers from `evidence/`, never typed by hand)
- not_run

## 60-second judge path
1. Open `/judges` → "Replay a halt" (no wallet needed).
2. Open `/board` → any exchange → reserves, proven floor, inclusion, heartbeat, score.
3. Open `/break` → run the attacks.

## What is real and what is demo
- Real: exchange addresses (with sources), on-chain balances/flows, historical events, zkTLS proofs from real accounts.
- Demo: devnet test-USDC in cover pools; LP and cover positions are test positions.

## What it proves / does not prove
- Proves: user-proven minimum liabilities, inclusion vs a published tree, withdrawal pattern vs the exchange's own baseline.
- Does not prove: total liabilities; solvency; anything about an exchange with no provers.

## Known issues
- (fill)

## Submission text (Colosseum + Earn fields)
- (fill from PRD §11)

## Build log
- 10 Oct 2026: idea locked after the engine run; files written.
