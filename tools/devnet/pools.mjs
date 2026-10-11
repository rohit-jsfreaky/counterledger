// Cover pools on devnet (test-USDC): one per exchange, seeded by a test LP. Idempotent.
//   node pools.mjs
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import BN from 'bn.js';
import { assertDevnet, connection, explorer, fund, keys, loadKeypair, pda, program, readState, retry, seed, web3, writeState } from './common.mjs';

export const USDC = 1_000_000;
export const CAP_BPS = 5_000;
export const BASE_RATE_BPS = 200;

export function lpKey() {
  const p = join(homedir(), '.counterledger', 'lp-devnet.json');
  if (!existsSync(p)) writeFileSync(p, JSON.stringify(Array.from(web3.Keypair.generate().secretKey)));
  return loadKeypair(p);
}

export async function tokenAccount(admin, mint, owner, topUp = 0) {
  const ata = await retry(() => getOrCreateAssociatedTokenAccount(connection, admin, mint, owner), 'ata');
  if (topUp) await retry(() => mintTo(connection, admin, mint, ata.address, admin, topUp), 'mint');
  return ata.address;
}

export async function ensurePool(prog, admin, exchangeId, mint) {
  const exchange = pda([seed('exchange'), seed(exchangeId)], prog.programId);
  const pool = pda([seed('pool'), exchange.toBuffer()], prog.programId);
  if (!(await retry(() => connection.getAccountInfo(pool)))) {
    const tx = await retry(() => prog.methods.createPool(CAP_BPS, BASE_RATE_BPS).accounts({ admin: admin.publicKey, exchange, usdcMint: mint }).rpc(), 'create_pool');
    console.log(`create_pool ${exchangeId}`, explorer(tx));
  }
  return { exchange, pool, vault: pda([seed('vault'), pool.toBuffer()], prog.programId) };
}

export async function deposit(prog, lp, pool, vault, lpToken, amount) {
  return retry(() => program(lp).methods.lpDeposit(new BN(amount)).accounts({ owner: lp.publicKey, pool, vault, ownerToken: lpToken }).rpc(), 'lp_deposit');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('pools.mjs')) {
  await assertDevnet();
  const { admin } = keys();
  const lp = lpKey();
  await fund(admin, lp.publicKey, 0.3);
  const prog = program(admin);
  const state = readState();
  const mint = new web3.PublicKey(state.usdcMint);
  const lpToken = await tokenAccount(admin, mint, lp.publicKey);
  state.pools = state.pools || {};
  for (const id of Object.keys(state.exchanges).filter((x) => !x.startsWith('replay'))) {
    const { pool, vault } = await ensurePool(prog, admin, id, mint);
    const p = await retry(() => prog.account.pool.fetch(pool));
    if (p.assets.toNumber() === 0) {
      await retry(() => mintTo(connection, admin, mint, lpToken, admin, 10_000 * USDC), 'mint');
      const tx = await deposit(prog, lp, pool, vault, lpToken, 10_000 * USDC);
      console.log(`lp_deposit ${id} 10,000 test-USDC`, explorer(tx));
    }
    state.pools[id] = { pool: pool.toBase58(), vault: vault.toBase58(), capBps: CAP_BPS, baseRateBps: BASE_RATE_BPS };
  }
  state.lp = lp.publicKey.toBase58();
  writeState(state);
  console.log('pools ->', 'data/devnet.json');
}
