// Prove my balance: opens a Reclaim verification for one exchange, waits for the proof, verifies it, saves it.
//
//   node prove.mjs --exchange binance --provider <reclaim provider id>
//
// The proof is bound to a devnet "prover" wallet (context address), so only that wallet can submit it on Solana.
// Raw proofs hold an account id and an exact balance (invariant 8), so they are saved under cache/private/ (gitignored)
// and this script prints field NAMES only, never values.
import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { ReclaimProofRequest, getIdentifierFromClaimInfo, verifyProof } from '@reclaimprotocol/js-sdk';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
config({ path: join(ROOT, '.env'), quiet: true });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const exchange = arg('exchange');
const providerId = arg('provider');
const mode = arg('mode', 'portal'); // 'portal' = Reclaim's remote browser in a tab; 'app' = phone verifier app
if (!exchange || !providerId) {
  console.error('usage: node prove.mjs --exchange <id> --provider <reclaim provider id> [--mode portal|app]');
  process.exit(2);
}
for (const k of ['RECLAIM_APP_ID', 'RECLAIM_APP_SECRET']) {
  if (!process.env[k]) throw new Error(`${k} missing in .env`);
}

// devnet prover wallet, kept outside the repo
const walletPath = join(homedir(), '.counterledger', 'prover-devnet.json');
if (!existsSync(walletPath)) {
  mkdirSync(dirname(walletPath), { recursive: true });
  writeFileSync(walletPath, JSON.stringify(Array.from(Keypair.generate().secretKey)));
}
const prover = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, 'utf8'))));

const request = await ReclaimProofRequest.init(process.env.RECLAIM_APP_ID, process.env.RECLAIM_APP_SECRET, providerId);
const epoch = Math.floor(Date.now() / 1000 / 86400 / 30); // 30-day proof epoch: one proof per account per epoch
request.setContext(prover.publicKey.toBase58(), JSON.stringify({ app: 'counterledger', exchange, epoch }));
const url = await request.getRequestUrl({ verificationMode: mode });

console.log(`\nexchange : ${exchange}`);
console.log(`provider : ${providerId}`);
console.log(`prover   : ${prover.publicKey.toBase58()} (devnet)`);
console.log(`\nOpen this link and log in to your ${exchange} account:\n\n  ${url}\n`);
console.log('Waiting for the proof...');

await request.startSession({
  onSuccess: async (proofs) => {
    const list = Array.isArray(proofs) ? proofs : [proofs];
    if (list.length === 0) {
      console.error('No proof returned.');
      process.exit(1);
    }
    const { providerVersion } = request.getProviderVersion();
    const result = await verifyProof(list, { providerId, providerVersion });
    const outDir = join(ROOT, 'cache', 'private', 'proofs');
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${exchange}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ exchange, providerId, providerVersion, epoch, prover: prover.publicKey.toBase58(), proofs: list }, null, 1));

    for (const p of list) {
      const ctx = JSON.parse(p.claimData.context);
      const idOk = getIdentifierFromClaimInfo(p.claimData) === p.claimData.identifier.toLowerCase();
      console.log(`\nproof ${p.identifier.slice(0, 10)}…  identifier recomputes: ${idOk}`);
      console.log(`  context address  : ${ctx.contextAddress}`);
      console.log(`  extracted fields : ${Object.keys(ctx.extractedParameters || {}).join(', ') || '(none)'}`);
      console.log(`  witnesses        : ${p.witnesses?.length ?? 0}, signatures: ${p.signatures?.length ?? 0}, epoch ${p.claimData.epoch}`);
    }
    console.log(`\nverifyProof: ${result.isVerified ? 'VERIFIED' : 'NOT VERIFIED — ' + result.error?.message}`);
    console.log(`saved (private, gitignored): ${file}`);
    process.exit(result.isVerified ? 0 : 1);
  },
  onError: (error) => {
    console.error('Verification failed:', error?.message || error);
    process.exit(1);
  },
});
