// Browser-side helpers for the Counterledger program on devnet (same logic as tools/devnet/*.mjs).
import { Buffer } from "buffer";
import { AnchorProvider, Program } from "@anchor-lang/core";
import BN from "bn.js";
import canonicalize from "canonicalize";
import sha3 from "js-sha3";
import { ComputeBudgetProgram, Connection, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "@/generated/idl.json";

export const PROGRAM_ID = new PublicKey((idl as any).address);
export const EPOCH_SECS = 30 * 86400;
const CHUNK = 850;

export function program(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as any, provider) as any;
}

export const seed = (s: string) => Buffer.from(s);
export const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const exchangePda = (id: string) => pda([seed("exchange"), seed(id)]);
export const poolPda = (exchange: PublicKey) => pda([seed("pool"), exchange.toBuffer()]);
export const vaultPda = (pool: PublicKey) => pda([seed("vault"), pool.toBuffer()]);

/** Sign all, then send one by one and poll for confirmation (the RPC proxy has no websocket). */
export async function signAndSend(
  connection: Connection,
  wallet: AnchorWallet,
  ixGroups: TransactionInstruction[][],
  onProgress?: (done: number, total: number, sig: string) => void,
): Promise<string[]> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const txs = ixGroups.map((ixs) => {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;
    return tx;
  });
  const signed = await wallet.signAllTransactions(txs);
  const sigs: string[] = [];
  for (const tx of signed) {
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
    for (let i = 0; i < 60; i++) {
      const st = (await connection.getSignatureStatuses([sig])).value[0];
      if (st?.err) throw new Error(`transaction failed: ${JSON.stringify(st.err)}`);
      if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    sigs.push(sig);
    onProgress?.(sigs.length, signed.length, sig);
  }
  return sigs;
}

/** Build the upload + record_proof instructions for a Reclaim verification (2 claims: account id + balance). */
export async function recordProofIxs(prog: any, prover: PublicKey, exchangeId: string, proofs: any[]) {
  const claims = proofs.map((p) => {
    const context = canonicalize(JSON.parse(p.claimData.context)) as string;
    const id = "0x" + sha3.keccak256(`${p.claimData.provider}\n${p.claimData.parameters}\n${context}`);
    if (id !== p.claimData.identifier.toLowerCase()) throw new Error("claim identifier does not recompute");
    return { p, context, extracted: JSON.parse(context).extractedParameters ?? {} };
  });
  if (claims.length !== 2) throw new Error(`expected 2 claims, got ${claims.length}`);
  const accountHash: string | undefined = claims.find((c) => c.extracted.account_id)?.extracted.account_id;
  const balanceClaim = claims.find((c) => c.extracted.wallet_balance);
  if (!accountHash || !balanceClaim) throw new Error("proof is missing the account id or the balance");

  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const parts: Buffer[] = [u32(2)];
  for (const c of claims) for (const s of [c.p.claimData.provider, c.p.claimData.parameters, c.context]) {
    const b = Buffer.from(s, "utf8");
    parts.push(u32(b.length), b);
  }
  const bytes = Buffer.concat(parts);
  const epoch = Math.floor(claims[0].p.claimData.timestampS / EPOCH_SECS);
  const epochLe = Buffer.alloc(4);
  epochLe.writeUInt32LE(epoch);
  const nullifier = Buffer.from(sha3.keccak256.arrayBuffer(Buffer.concat([Buffer.from(`counterledger:v1:${exchangeId}:`), Buffer.from(accountHash), Buffer.from(":"), epochLe])));

  const exchange = exchangePda(exchangeId);
  const buffer = pda([seed("claims"), prover.toBuffer()]);
  const proofRecord = pda([seed("proof"), exchange.toBuffer(), nullifier]);

  const groups: TransactionInstruction[][] = [];
  if (await prog.provider.connection.getAccountInfo(buffer)) groups.push([await prog.methods.closeClaimBuffer().accounts({ prover }).instruction()]);
  groups.push([await prog.methods.openClaimBuffer(bytes.length).accounts({ prover }).instruction()]);
  for (let off = 0; off < bytes.length; off += CHUNK) {
    groups.push([await prog.methods.writeClaimBuffer(off, Buffer.from(bytes.subarray(off, off + CHUNK))).accounts({ prover }).instruction()]);
  }
  const signed = claims.map((c) => ({
    owner: c.p.claimData.owner,
    timestampS: c.p.claimData.timestampS,
    epoch: c.p.claimData.epoch,
    signature: Array.from(Buffer.from(c.p.signatures[0].replace(/^0x/, ""), "hex")),
  }));
  groups.push([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    await prog.methods.recordProof(Array.from(nullifier), signed).accounts({ prover, exchange, proofRecord }).instruction(),
  ]);
  return { groups, nullifier: "0x" + nullifier.toString("hex"), proofRecord, epoch, asset: balanceClaim.extracted.asset as string };
}

export { BN };
