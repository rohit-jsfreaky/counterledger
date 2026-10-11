// Observer: post each exchange's heartbeat state and score to devnet with the evidence hash (the JSON in evidence/ is
// the preimage; `uv run verify` recomputes it). Records what was posted in evidence/onchain/reports.json.
//   node post-reports.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import BN from 'bn.js';
import { ROOT, assertDevnet, explorer, keys, pda, program, seed } from './common.mjs';

const EXCHANGES = ['coindcx', 'wazirx', 'binance', 'bybit', 'okx', 'kucoin', 'bitget'];
const HB_CODE = { unknown: 0, normal: 1, below_usual_pattern: 2, not_enough_data: 3, halt_confirmed: 4 };

await assertDevnet();
const { observer } = keys();
const prog = program(observer);
const outFile = join(ROOT, 'evidence', 'onchain', 'reports.json');
mkdirSync(join(ROOT, 'evidence', 'onchain'), { recursive: true });
const posted = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const secs = (iso) => Math.floor(Date.parse(iso) / 1000);
const hashBytes = (h) => Array.from(Buffer.from(h, 'hex'));

for (const id of EXCHANGES) {
  const exchange = pda([seed('exchange'), seed(id)], prog.programId);
  const onchain = await prog.account.exchange.fetch(exchange);
  posted[id] = posted[id] || {};

  const hbFile = join(ROOT, 'evidence', 'heartbeat', `${id}.json`);
  if (existsSync(hbFile)) {
    const hb = JSON.parse(readFileSync(hbFile, 'utf8'));
    const asOf = secs(hb.as_of);
    if (asOf > onchain.heartbeat.asOf.toNumber()) {
      const tx = await prog.methods
        .postHeartbeat(HB_CODE[hb.state], new BN(asOf), hashBytes(hb.evidence_sha256))
        .accounts({ observer: observer.publicKey, exchange })
        .rpc();
      posted[id].heartbeat = { state: hb.state, value: HB_CODE[hb.state], as_of: hb.as_of, evidence_sha256: hb.evidence_sha256, tx };
      console.log(`${id} heartbeat ${hb.state}`, explorer(tx));
    }
  }

  const sc = JSON.parse(readFileSync(join(ROOT, 'evidence', 'score', `${id}.json`), 'utf8'));
  const asOf = secs(sc.as_of);
  const already = posted[id].score?.evidence_sha256 === sc.evidence_sha256;
  if (!already && asOf >= onchain.score.asOf.toNumber()) {
    const tx = await prog.methods
      .postScore(sc.score, new BN(asOf), hashBytes(sc.evidence_sha256))
      .accounts({ observer: observer.publicKey, exchange })
      .rpc();
    posted[id].score = { value: sc.score, as_of: sc.as_of, evidence_sha256: sc.evidence_sha256, tx };
    console.log(`${id} score ${sc.score}`, explorer(tx));
  }
}
writeFileSync(outFile, JSON.stringify(posted, null, 1) + '\n');
console.log('->', 'evidence/onchain/reports.json');
