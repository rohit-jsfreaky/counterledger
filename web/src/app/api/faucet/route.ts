// Devnet faucet for judges: 0.05 devnet SOL (proof rent) + 100 test-USDC (cover). Test money with no value.
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { adminKeypair, assertDevnet, serverConnection } from "@/lib/server-keys";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const last = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const { wallet } = await req.json().catch(() => ({}));
  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return Response.json({ error: "bad wallet" }, { status: 400 });
  }
  const prev = last.get(owner.toBase58()) ?? 0;
  if (Date.now() - prev < COOLDOWN_MS) return Response.json({ error: "Faucet used recently for this wallet. Try again in a few minutes." }, { status: 429 });
  const admin = adminKeypair();
  if (!admin) return Response.json({ error: "faucet not configured" }, { status: 500 });
  const conn = serverConnection();
  await assertDevnet(conn);
  const devnet = JSON.parse(readFileSync(join(process.cwd(), "src", "generated", "data", "devnet.json"), "utf8"));
  const mint = new PublicKey(devnet.usdcMint);

  last.set(owner.toBase58(), Date.now());
  const out: Record<string, string> = {};
  try {
    if ((await conn.getBalance(owner)) < 0.04 * LAMPORTS_PER_SOL) {
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: owner, lamports: 0.05 * LAMPORTS_PER_SOL }));
      out.sol = await sendAndConfirmTransaction(conn, tx, [admin]);
    }
    const ata = await getOrCreateAssociatedTokenAccount(conn, admin, mint, owner);
    out.usdc = await mintTo(conn, admin, mint, ata.address, admin, 100_000_000);
    return Response.json({ ok: true, txs: out, tokenAccount: ata.address.toBase58() });
  } catch (e: any) {
    last.delete(owner.toBase58()); // a failed send should not lock the wallet out
    return Response.json({ error: `Devnet send failed, try again: ${String(e?.message ?? e).slice(0, 160)}`, txs: out }, { status: 502 });
  }
}
