// Devnet-only server keys. On Vercel: COUNTERLEDGER_ADMIN_KEYPAIR (JSON array). Locally: the deployer file in WSL.
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";

import { devnetConnection } from "./devnet-rpc";

export function serverConnection(): Connection {
  return devnetConnection();
}

export function adminKeypair(): Keypair | null {
  const raw =
    process.env.COUNTERLEDGER_ADMIN_KEYPAIR ??
    (existsSync("//wsl.localhost/Ubuntu/home/rohit/.config/solana/id.json")
      ? readFileSync("//wsl.localhost/Ubuntu/home/rohit/.config/solana/id.json", "utf8")
      : null);
  return raw ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))) : null;
}

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export async function assertDevnet(conn: Connection) {
  if ((await conn.getGenesisHash()) !== DEVNET_GENESIS) throw new Error("refusing: not devnet");
}
