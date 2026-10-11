// One-time devnet setup (idempotent): test-USDC mint, program config, exchanges. Writes public addresses to
// data/devnet.json.
//   node setup.mjs
import { createMint } from '@solana/spl-token';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RECLAIM_ATTESTOR, ROOT, assertDevnet, connection, explorer, fund, keys, pda, program, readState, seed, web3, writeState } from './common.mjs';

const EXCHANGES = [
  ['coindcx', 'CoinDCX'],
  ['wazirx', 'WazirX'],
  ['binance', 'Binance'],
  ['bybit', 'Bybit'],
  ['okx', 'OKX'],
  ['kucoin', 'KuCoin'],
  ['bitget', 'Bitget'],
];
const CHALLENGE_WINDOW_SECS = 120; // short on devnet so the demo can finish a trigger; documented in the README

/** CoinDCX provider hashes, read from the claim contexts of a real proof (public: they hash the provider recipe). */
function coindcxProviderHashes() {
  const dir = join(ROOT, 'cache', 'private', 'proofs');
  const file = readdirSync(dir).filter((f) => f.startsWith('coindcx-')).sort().pop();
  const { proofs } = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  return [...new Set(proofs.map((p) => JSON.parse(p.claimData.context).providerHash))];
}

const hexBytes = (h) => Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

await assertDevnet();
const { admin, observer, prover } = keys();
const prog = program(admin);
const state = readState();
state.cluster = 'devnet';
state.programId = prog.programId.toBase58();
state.admin = admin.publicKey.toBase58();
state.observer = observer.publicKey.toBase58();
state.attestors = [RECLAIM_ATTESTOR];
state.challengeWindowSecs = CHALLENGE_WINDOW_SECS;
state.txs = state.txs || {};

console.log('admin   ', state.admin, (await connection.getBalance(admin.publicKey)) / 1e9, 'SOL');
for (const [name, kp] of [['observer', observer], ['prover', prover]]) {
  const sig = await fund(admin, kp.publicKey, 0.3);
  if (sig) console.log(`funded ${name}`, explorer(sig));
}

if (!state.usdcMint) {
  const mint = await createMint(connection, admin, admin.publicKey, null, 6);
  state.usdcMint = mint.toBase58();
  console.log('test-USDC mint', state.usdcMint);
  writeState(state);
}

const config = pda([seed('config')], prog.programId);
state.config = config.toBase58();
if (!(await connection.getAccountInfo(config))) {
  const sig = await prog.methods
    .initialize(observer.publicKey, [hexBytes(RECLAIM_ATTESTOR)], new (await import('bn.js')).default(CHALLENGE_WINDOW_SECS))
    .accounts({ admin: admin.publicKey, usdcMint: new web3.PublicKey(state.usdcMint) })
    .rpc();
  state.txs.initialize = sig;
  console.log('initialize', explorer(sig));
}

state.exchanges = state.exchanges || {};
const coindcxHashes = coindcxProviderHashes();
for (const [id, name] of EXCHANGES) {
  const ex = pda([seed('exchange'), seed(id)], prog.programId);
  state.exchanges[id] = { ...(state.exchanges[id] || {}), name, address: ex.toBase58() };
  const hashes = id === 'coindcx' ? coindcxHashes : [];
  state.exchanges[id].providerHashes = hashes;
  if (!(await connection.getAccountInfo(ex))) {
    const sig = await prog.methods.addExchange(id, name, hashes.map(hexBytes)).accounts({ admin: admin.publicKey }).rpc();
    state.exchanges[id].addTx = sig;
    console.log('add_exchange', id, explorer(sig));
  }
}
writeState(state);
console.log('state ->', 'data/devnet.json');
