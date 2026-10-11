// Record a saved Reclaim proof on devnet: upload the claim info in chunks, then one record_proof transaction that the
// program checks end to end (identifier, attestor signature, provider hash, wallet binding, freshness, nullifier).
//   node record-proof.mjs [path/to/private/proof.json]
// Writes PUBLIC evidence to evidence/proofs/ (bucket + nullifier + tx links, never the exact balance or account id).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import canonicalize from 'canonicalize';
import sha3 from 'js-sha3';
import BN from 'bn.js';
import { ROOT, assertDevnet, connection, explorer, keys, pda, program, readState, seed, web3 } from './common.mjs';

const EPOCH_SECS = 30 * 86400;
const CHUNK = 850;
const BUCKETS = ['< 1', '1 – 10', '10 – 100', '100 – 1k', '1k – 10k', '≥ 10k'];

const dir = join(ROOT, 'cache', 'private', 'proofs');
const file = process.argv[2] || join(dir, readdirSync(dir).filter((f) => f.startsWith('coindcx-')).sort().pop());
const saved = JSON.parse(readFileSync(file, 'utf8'));
const exchangeId = saved.exchange;

await assertDevnet();
const { prover } = keys();
if (saved.prover !== prover.publicKey.toBase58()) throw new Error('proof is bound to another wallet');
const prog = program(prover);
const state = readState();

// claim info exactly as Reclaim hashed it: provider \n parameters \n canonical(context)
const claims = saved.proofs.map((p) => {
  const context = canonicalize(JSON.parse(p.claimData.context));
  const id = '0x' + sha3.keccak256(`${p.claimData.provider}\n${p.claimData.parameters}\n${context}`);
  if (id !== p.claimData.identifier.toLowerCase()) throw new Error('identifier does not recompute');
  return { p, context, id, extracted: JSON.parse(context).extractedParameters };
});
if (claims.length !== 2) throw new Error('expected 2 claims (account id + balance)');

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const parts = [u32(2)];
for (const c of claims) {
  for (const s of [c.p.claimData.provider, c.p.claimData.parameters, c.context]) {
    const b = Buffer.from(s, 'utf8');
    parts.push(u32(b.length), b);
  }
}
const bytes = Buffer.concat(parts);

const accountHash = claims.find((c) => c.extracted.account_id).extracted.account_id;
const ts = claims[0].p.claimData.timestampS;
const epoch = Math.floor(ts / EPOCH_SECS);
const epochLe = Buffer.alloc(4); epochLe.writeUInt32LE(epoch);
const nullifier = Buffer.from(
  sha3.keccak256.arrayBuffer(Buffer.concat([Buffer.from(`counterledger:v1:${exchangeId}:`), Buffer.from(accountHash), Buffer.from(':'), epochLe])),
);

const exchange = pda([seed('exchange'), seed(exchangeId)], prog.programId);
const buffer = pda([seed('claims'), prover.publicKey.toBuffer()], prog.programId);
const proofRecord = pda([seed('proof'), exchange.toBuffer(), nullifier], prog.programId);
if (await connection.getAccountInfo(proofRecord)) throw new Error('this account already has a proof recorded for this epoch');

const txs = [];
if (await connection.getAccountInfo(buffer)) {
  txs.push(await prog.methods.closeClaimBuffer().accounts({ prover: prover.publicKey }).rpc());
}
txs.push(await prog.methods.openClaimBuffer(bytes.length).accounts({ prover: prover.publicKey }).rpc());
for (let off = 0; off < bytes.length; off += CHUNK) {
  txs.push(
    await prog.methods
      .writeClaimBuffer(off, Buffer.from(bytes.subarray(off, off + CHUNK)))
      .accounts({ prover: prover.publicKey })
      .rpc(),
  );
}
console.log(`uploaded ${bytes.length} bytes in ${txs.length} txs`);

const signed = claims.map((c) => ({
  owner: c.p.claimData.owner,
  timestampS: c.p.claimData.timestampS,
  epoch: c.p.claimData.epoch,
  signature: Array.from(Buffer.from(c.p.signatures[0].replace(/^0x/, ''), 'hex')),
}));
const recordIx = await prog.methods
  .recordProof(Array.from(nullifier), signed)
  .accounts({ prover: prover.publicKey, exchange, proofRecord })
  .instruction();
const tx = new web3.Transaction()
  .add(web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }))
  .add(recordIx);
const recordSig = await web3.sendAndConfirmTransaction(connection, tx, [prover]);
console.log('record_proof', explorer(recordSig));

const rec = await prog.account.proofRecord.fetch(proofRecord);
const ex = await prog.account.exchange.fetch(exchange);
const asset = Buffer.from(rec.asset).toString('utf8').replace(/\0+$/, '');
const floor = ex.floors.find((f) => Buffer.from(f.asset).toString('utf8').replace(/\0+$/, '') === asset);
const evidence = {
  kind: 'balance-proof',
  cluster: 'devnet',
  exchange: exchangeId,
  programId: prog.programId.toBase58(),
  proofRecord: proofRecord.toBase58(),
  nullifier: '0x' + nullifier.toString('hex'),
  prover: prover.publicKey.toBase58(),
  asset,
  bucket: rec.bucket,
  bucketLabel: `${BUCKETS[rec.bucket]} ${asset}`,
  epoch: rec.epoch,
  reclaimProviderId: saved.providerId,
  claimIdentifiers: claims.map((c) => c.id),
  attestor: saved.proofs[0].witnesses?.[0]?.id,
  floorAfter: { amount: new BN(floor.amount).toString(), decimals: 6, provers: floor.provers },
  txs: { upload: txs, recordProof: recordSig },
  explorer: explorer(recordSig),
  note: 'Exact balance and account id are not in this file. The claim info inside the upload transactions is public on devnet.',
};
const out = join(ROOT, 'evidence', 'proofs');
mkdirSync(out, { recursive: true });
const path = join(out, `${exchangeId}-${recordSig.slice(0, 12)}.json`);
writeFileSync(path, JSON.stringify(evidence, null, 1) + '\n');
console.log(`floor ${asset}: ${floor.provers} prover(s); bucket ${evidence.bucketLabel}`);
console.log('evidence ->', path.replace(ROOT, '').replace(/\\/g, '/'));
