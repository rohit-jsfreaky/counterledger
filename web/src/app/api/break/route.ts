// Live attack simulations against the real program on devnet. Each attack builds a transaction and runs
// simulateTransaction (sigVerify off, so we can "sign" as anyone): nothing is ever sent, nothing changes on-chain.
import { Buffer } from "buffer";
import { createHash } from "node:crypto";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { BN, exchangePda, pda, poolPda, program, seed, vaultPda } from "@/lib/chain";
import { devnet } from "@/lib/data";
import { devnetConnection } from "@/lib/devnet-rpc";

const ATTACKS = ["control", "forged", "replay", "steal", "impostor", "stale", "overcap", "halt"] as const;
type Attack = (typeof ATTACKS)[number];

const connection = devnetConnection();
const USDC = 1_000_000;
const reader = () =>
  program(connection, { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any);
const fresh = (label: string) => Array.from(createHash("sha256").update(`counterledger-break:${label}`).digest());
const signedArgs = (st: any) =>
  st.break.signed.map((s: any) => ({ owner: s.owner, timestampS: s.timestampS, epoch: s.epoch, signature: Array.from(Buffer.from(s.signature.replace(/^0x/, ""), "hex")) }));

async function build(attack: Attack): Promise<{ payer: PublicKey; ixs: TransactionInstruction[] }> {
  const st = devnet();
  const prog = reader();
  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
  const coindcx = exchangePda("coindcx");
  const mint = new PublicKey(st.usdcMint);
  const lp = new PublicKey(st.lp);
  const proof = async (who: string, nullifier: number[]) => {
    const prover = new PublicKey(who);
    const proofRecord = pda([seed("proof"), coindcx.toBuffer(), Buffer.from(nullifier)]);
    const ix = await prog.methods.recordProof(nullifier, signedArgs(st)).accounts({ prover, exchange: coindcx, proofRecord }).instruction();
    return { payer: prover, ixs: [cu, ix] };
  };
  const cover = async (exchangeId: string, notional: number) => {
    const exchange = exchangePda(exchangeId);
    const pool = poolPda(exchange);
    const poolAcc: any = await prog.account.pool.fetch(pool);
    const index: BN = poolAcc.coversSold;
    const coverPda = pda([seed("cover"), pool.toBuffer(), index.toArrayLike(Buffer, "le", 8)]);
    const ix = await prog.methods
      .buyCover(new BN(notional).mul(new BN(USDC)), 30, index)
      .accounts({ owner: lp, exchange, pool, vault: vaultPda(pool), ownerToken: getAssociatedTokenAddressSync(mint, lp), cover: coverPda })
      .instruction();
    return { payer: lp, ixs: [ix] };
  };

  switch (attack) {
    case "control": {
      // Honest: the real observer re-posts the heartbeat already on-chain (same value, time and evidence hash).
      const observer = new PublicKey(st.observer);
      const ex: any = await prog.account.exchange.fetch(coindcx);
      const ix = await prog.methods.postHeartbeat(ex.heartbeat.value, ex.heartbeat.asOf, ex.heartbeat.evidenceHash).accounts({ observer, exchange: coindcx }).instruction();
      return { payer: observer, ixs: [ix] };
    }
    case "forged":
      return proof(st.break.forger.wallet, fresh("forged"));
    case "replay":
      return proof(st.break.replayer.wallet, Array.from(Buffer.from(st.break.nullifier.replace(/^0x/, ""), "hex")));
    case "steal":
      return proof(st.break.replayer.wallet, fresh("steal"));
    case "impostor": {
      const fake = new PublicKey(st.break.replayer.wallet);
      const ix = await prog.methods.postScore(100, new BN(Math.floor(Date.now() / 1000)), fresh("impostor")).accounts({ observer: fake, exchange: coindcx }).instruction();
      return { payer: fake, ixs: [ix] };
    }
    case "stale": {
      const observer = new PublicKey(st.observer);
      const ex: any = await prog.account.exchange.fetch(coindcx);
      const older = ex.heartbeat.asOf.sub(new BN(86_400));
      const ix = await prog.methods.postHeartbeat(1, older, fresh("stale")).accounts({ observer, exchange: coindcx }).instruction();
      return { payer: observer, ixs: [ix] };
    }
    case "overcap": {
      const poolAcc: any = await prog.account.pool.fetch(poolPda(coindcx));
      return cover("coindcx", Math.ceil(poolAcc.assets.toNumber() / USDC)); // 100% of assets; the cap is 50%
    }
    case "halt":
      return cover(Object.keys(st.replays ?? {})[0] ?? "rp-ftx-a1", 10);
  }
}

function explain(logs: string[], err: unknown) {
  const anchorErr = logs.map((l) => l.match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)\.?$/)).find(Boolean);
  if (anchorErr) return { code: anchorErr[1], number: Number(anchorErr[2]), message: anchorErr[3] };
  const inUse = logs.find((l) => /already in use/.test(l));
  if (inUse) return { code: "AccountAlreadyInUse", number: 0, message: "The proof record for this account and epoch already exists (one account counts once)" };
  return { code: err ? "Failed" : "Succeeded", number: 0, message: err ? JSON.stringify(err) : "The transaction would have succeeded" };
}

export async function POST(req: Request) {
  let attack: Attack;
  try {
    attack = (await req.json()).attack;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!ATTACKS.includes(attack)) return Response.json({ error: "unknown attack" }, { status: 400 });
  try {
    const { payer, ixs } = await build(attack);
    const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: ixs }).compileToV0Message();
    const sim = await connection.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
    const logs = sim.value.logs ?? [];
    return Response.json({
      attack,
      rejected: !!sim.value.err,
      result: explain(logs, sim.value.err),
      logs: logs.filter((l) => !/^Program (ComputeBudget|11111111111111111111111111111111) /.test(l)).slice(-12),
      unitsConsumed: sim.value.unitsConsumed ?? null,
      slot: sim.context.slot,
    });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
