// Shared devnet helpers. DEVNET ONLY (CLAUDE.md invariant 9): the cluster is hard-coded and checked.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import anchor from '@anchor-lang/core';

export const { web3 } = anchor;
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
config({ path: join(ROOT, '.env'), quiet: true });

export const DEVNET = 'https://api.devnet.solana.com';
export const connection = new web3.Connection(DEVNET, 'confirmed');
export const STATE_FILE = join(ROOT, 'data', 'devnet.json');
export const RECLAIM_ATTESTOR = '0x244897572368eadf65bfbc5aec98d8e5443a9072'; // witness id on our proofs

export function loadKeypair(path) {
  return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

/** Keys live OUTSIDE the repo. Admin = the devnet deployer in WSL; observer + prover in ~/.counterledger/. */
export function keys() {
  const dir = join(homedir(), '.counterledger');
  mkdirSync(dir, { recursive: true });
  const ensure = (name) => {
    const p = join(dir, name);
    if (!existsSync(p)) writeFileSync(p, JSON.stringify(Array.from(web3.Keypair.generate().secretKey)));
    return loadKeypair(p);
  };
  return {
    admin: loadKeypair('//wsl.localhost/Ubuntu/home/rohit/.config/solana/id.json'),
    observer: ensure('observer-devnet.json'),
    prover: ensure('prover-devnet.json'),
  };
}

export function program(signer) {
  const idl = JSON.parse(readFileSync(join(ROOT, 'program', 'target', 'idl', 'counterledger.json'), 'utf8'));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(signer), { commitment: 'confirmed' });
  return new anchor.Program(idl, provider);
}

export async function assertDevnet() {
  const genesis = await connection.getGenesisHash();
  // devnet genesis hash (solana docs); refuse anything else
  if (genesis !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error(`not devnet: ${genesis}`);
}

export function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
}

export function writeState(s) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n');
}

export const seed = (s) => Buffer.from(s);
export function pda(seeds, programId) {
  return web3.PublicKey.findProgramAddressSync(seeds, programId)[0];
}

export async function fund(from, to, sol) {
  const bal = await connection.getBalance(to);
  if (bal >= sol * web3.LAMPORTS_PER_SOL) return null;
  const tx = new web3.Transaction().add(
    web3.SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports: Math.round(sol * web3.LAMPORTS_PER_SOL) }),
  );
  return web3.sendAndConfirmTransaction(connection, tx, [from]);
}

export const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The public devnet RPC rate-limits (429). Retry with backoff, and pause between transactions. */
export async function retry(fn, label = 'rpc') {
  for (let i = 0; ; i++) {
    try {
      const out = await fn();
      await sleep(1200);
      return out;
    } catch (e) {
      const msg = String(e?.message || e);
      if (i >= 6 || !/429|Too Many|timed out|fetch failed|ECONNRESET|blockhash/i.test(msg)) throw e;
      const wait = 2000 * 2 ** i;
      console.log(`  ${label}: ${msg.slice(0, 60)}… retry in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}
