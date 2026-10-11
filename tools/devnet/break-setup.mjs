// One-time setup for the /break page: two attacker wallets each get a claim buffer on devnet, so the web app can
// SIMULATE record_proof attacks against the real program (simulateTransaction, nothing is ever sent):
//   forger   — the real CoinDCX claims with the balance edited to 250,000 and the wallet swapped to the forger's
//   replayer — the real claims, unedited (re-submitting someone else's recorded proof)
//   node break-setup.mjs
// Uses the claim info already public in the upload txs of evidence/proofs/coindcx-*.json. Writes pubkeys + the
// (public) signed-claim args to data/devnet.json → break.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import canonicalize from 'canonicalize';
import sha3 from 'js-sha3';
import { ROOT, assertDevnet, connection, explorer, fund, keys, loadKeypair, pda, program, readState, retry, seed, web3, writeState } from './common.mjs';

const CHUNK = 850;
const EPOCH_SECS = 30 * 86400;
const dir = join(ROOT, 'cache', 'private', 'proofs');
const saved = JSON.parse(readFileSync(join(dir, readdirSync(dir).filter((f) => f.startsWith('coindcx-')).sort().pop()), 'utf8'));

await assertDevnet();
const { admin } = keys();
const wallet = (name) => {
  const p = join(homedir(), '.counterledger', `break-${name}.json`);
  if (!existsSync(p)) writeFileSync(p, JSON.stringify(Array.from(web3.Keypair.generate().secretKey)));
  return loadKeypair(p);
};
const forger = wallet('forger');
const replayer = wallet('replayer');

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
function encode(claims) {
  const parts = [u32(claims.length)];
  for (const c of claims) for (const s of [c.provider, c.parameters, c.context]) {
    const b = Buffer.from(s, 'utf8');
    parts.push(u32(b.length), b);
  }
  return Buffer.concat(parts);
}
const real = saved.proofs.map((p) => ({ provider: p.claimData.provider, parameters: p.claimData.parameters, context: canonicalize(JSON.parse(p.claimData.context)) }));
const edited = real.map((c) => {
  const ctx = JSON.parse(c.context);
  ctx.contextAddress = forger.publicKey.toBase58();
  if (ctx.extractedParameters?.wallet_balance) ctx.extractedParameters.wallet_balance = '250000.0';
  return { ...c, context: canonicalize(ctx) };
});

async function upload(kp, bytes) {
  const prog = program(kp);
  const buffer = pda([seed('claims'), kp.publicKey.toBuffer()], prog.programId);
  const txs = [];
  const f = await fund(admin, kp.publicKey, 0.04);
  if (f) txs.push(f);
  if (await connection.getAccountInfo(buffer)) txs.push(await retry(() => prog.methods.closeClaimBuffer().accounts({ prover: kp.publicKey }).rpc(), 'close'));
  txs.push(await retry(() => prog.methods.openClaimBuffer(bytes.length).accounts({ prover: kp.publicKey }).rpc(), 'open'));
  for (let off = 0; off < bytes.length; off += CHUNK) {
    txs.push(await retry(() => prog.methods.writeClaimBuffer(off, Buffer.from(bytes.subarray(off, off + CHUNK))).accounts({ prover: kp.publicKey }).rpc(), 'write'));
  }
  console.log(`${kp.publicKey.toBase58()}: ${bytes.length} bytes, last tx ${explorer(txs[txs.length - 1])}`);
  return { wallet: kp.publicKey.toBase58(), buffer: buffer.toBase58(), txs };
}

const accountHash = JSON.parse(real.find((c) => JSON.parse(c.context).extractedParameters?.account_id).context).extractedParameters.account_id;
const epoch = Math.floor(saved.proofs[0].claimData.timestampS / EPOCH_SECS);
const epochLe = Buffer.alloc(4); epochLe.writeUInt32LE(epoch);
const nullifier = Buffer.from(sha3.keccak256.arrayBuffer(Buffer.concat([Buffer.from('counterledger:v1:coindcx:'), Buffer.from(accountHash), Buffer.from(':'), epochLe])));

const state = readState();
state.break = {
  note: 'Attacker wallets for /break simulations. Buffers hold public claim info; nothing is ever sent from the web app.',
  exchange: 'coindcx',
  nullifier: '0x' + nullifier.toString('hex'),
  signed: saved.proofs.map((p) => ({ owner: p.claimData.owner, timestampS: p.claimData.timestampS, epoch: p.claimData.epoch, signature: p.signatures[0] })),
  forger: await upload(forger, encode(edited)),
  replayer: await upload(replayer, encode(real)),
};
writeState(state);
console.log('saved -> data/devnet.json break');
