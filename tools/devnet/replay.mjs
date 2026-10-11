// End-to-end halt replay on a FRESH devnet pool, from a real past halt's published evidence:
// pre-event heartbeat + score → user buys cover → halt confirmed posted → trigger → challenge window → payout.
//   node replay.mjs [event=ftx-2022-11] [suffix]
// Writes evidence/onchain/replay-<event>-<suffix>.json with every tx.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import BN from 'bn.js';
import { ROOT, assertDevnet, connection, explorer, fund, keys, pda, program, readState, retry, seed, sleep, web3, writeState } from './common.mjs';
import { USDC, deposit, ensurePool, lpKey, tokenAccount } from './pools.mjs';

const HB_NORMAL = 1;
const HB_HALT = 4;
const event = process.argv[2] || 'ftx-2022-11';
const suffix = process.argv[3] || Date.now().toString(36).slice(-4);
const exchangeId = `rp-${event.split('-')[0]}-${suffix}`.slice(0, 16);

await assertDevnet();
const { admin, observer, prover: buyer } = keys();
const lp = lpKey();
const state = readState();
const mint = new web3.PublicKey(state.usdcMint);
const progAdmin = program(admin);
const progObserver = program(observer);
const progBuyer = program(buyer);
const replay = JSON.parse(readFileSync(join(ROOT, 'evidence', 'replay', `${event}.json`), 'utf8'));
const coverEvidence = replay.sources.cover_backtest.evidence_sha256;
const hb = (h) => Array.from(Buffer.from(h, 'hex'));
const now = async () => (await connection.getBlockTime(await connection.getSlot())) ?? Math.floor(Date.now() / 1000);
const log = {};
const step = async (name, fn) => { const tx = await retry(fn, name); log[name] = tx; console.log(name.padEnd(16), explorer(tx)); return tx; };

await fund(admin, buyer.publicKey, 0.3);
await step('add_exchange', () => progAdmin.methods.addExchange(exchangeId, `Replay: ${event}`, []).accounts({ admin: admin.publicKey }).rpc());
const { exchange, pool, vault } = await ensurePool(progAdmin, admin, exchangeId, mint);
const lpToken = await tokenAccount(admin, mint, lp.publicKey, 10_000 * USDC);
log.lp_deposit = await deposit(progAdmin, lp, pool, vault, lpToken, 10_000 * USDC);
console.log('lp_deposit'.padEnd(16), explorer(log.lp_deposit));

// 1. before the halt: normal heartbeat + score (pre-event inputs from the backtest, evidence hash = replay doc)
let t = await now();
await step('post_heartbeat', () => progObserver.methods.postHeartbeat(HB_NORMAL, new BN(t), hb(replay.evidence_sha256)).accounts({ observer: observer.publicKey, exchange }).rpc());
await step('post_score', () => progObserver.methods.postScore(replay.pre_event.score, new BN(t), hb(replay.evidence_sha256)).accounts({ observer: observer.publicKey, exchange }).rpc());

// 2. a user buys 30-day cover for 1,000 test-USDC, priced by the score
const buyerToken = await tokenAccount(admin, mint, buyer.publicKey, 100 * USDC);
const before = (await connection.getTokenAccountBalance(buyerToken)).value.amount;
const index = (await progAdmin.account.pool.fetch(pool)).coversSold;
const cover = pda([seed('cover'), pool.toBuffer(), index.toArrayLike(Buffer, 'le', 8)], progAdmin.programId);
await step('buy_cover', () => progBuyer.methods.buyCover(new BN(1_000 * USDC), 30, index).accounts({ owner: buyer.publicKey, exchange, pool, vault, ownerToken: buyerToken, cover }).rpc());
const c = await progAdmin.account.cover.fetch(cover);

// 3. the halt: observer posts HALT_CONFIRMED with the cover-backtest evidence hash, opens the trigger
t = await now();
await step('post_halt', () => progObserver.methods.postHeartbeat(HB_HALT, new BN(t), hb(coverEvidence)).accounts({ observer: observer.publicKey, exchange }).rpc());
await step('open_trigger', () => progObserver.methods.openTrigger(hb(coverEvidence)).accounts({ observer: observer.publicKey, exchange, pool }).rpc());

// 4. challenge window, then anyone finalizes and the buyer claims
const window = state.challengeWindowSecs;
console.log(`challenge window ${window}s…`);
await sleep((window + 8) * 1000);
await step('finalize_trigger', () => progAdmin.methods.finalizeTrigger().accounts({ exchange, pool }).rpc());
await step('claim_cover', () => progBuyer.methods.claimCover().accounts({ owner: buyer.publicKey, pool, vault, ownerToken: buyerToken, cover }).rpc());
const after = (await connection.getTokenAccountBalance(buyerToken)).value.amount;

const out = {
  kind: 'devnet-halt-replay',
  event,
  exchangeId,
  exchange: exchange.toBase58(),
  pool: pool.toBase58(),
  cover: cover.toBase58(),
  premium_test_usdc: Number(c.premium) / USDC,
  notional_test_usdc: Number(c.notional) / USDC,
  buyer_balance_before: Number(before) / USDC,
  buyer_balance_after: Number(after) / USDC,
  paid_test_usdc: (Number(after) - Number(before) + Number(c.premium)) / USDC,
  challenge_window_secs: window,
  evidence: { replay: `evidence/replay/${event}.json`, replay_sha256: replay.evidence_sha256, cover_backtest_sha256: coverEvidence },
  historical: { halt_confirmed: replay.halt_confirmed, payout_due: replay.payout_due, nexus_earliest_claim_days_after_T: 100 },
  txs: log,
  note: 'Test-USDC on devnet. A protocol demo, not insurance.',
};
mkdirSync(join(ROOT, 'evidence', 'onchain'), { recursive: true });
const f = join(ROOT, 'evidence', 'onchain', `replay-${event}-${suffix}.json`);
writeFileSync(f, JSON.stringify(out, null, 1) + '\n');
state.replays = { ...(state.replays || {}), [exchangeId]: { event, file: f.replace(ROOT, '').replace(/\\/g, '/').slice(1) } };
writeState(state);
console.log(`premium ${out.premium_test_usdc} test-USDC → paid ${1000} test-USDC on finalize; evidence ->`, out.evidence.replay);
