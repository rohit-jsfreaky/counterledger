import "server-only";
import { Connection } from "@solana/web3.js";

// Helius devnet sometimes answers "account not found" for accounts that exist (about 1 in 4 reads on 11 Oct, seen
// with getAccountInfo at "confirmed"). Reads that come back empty are retried, then asked of the public devnet RPC.
const PUBLIC = "https://api.devnet.solana.com";
const helius = () => (process.env.HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : PUBLIC);
const READS = new Set(["getAccountInfo", "getMultipleAccounts", "getTokenAccountBalance", "simulateTransaction"]);

function looksEmpty(call: any, res: any): boolean {
  if (!READS.has(call?.method)) return false;
  if (res?.error) return true;
  const v = res?.result?.value;
  if (call.method === "getAccountInfo") return v === null;
  if (call.method === "getMultipleAccounts") return Array.isArray(v) && v.some((x) => x === null);
  if (call.method === "simulateTransaction") return v?.err === "AccountNotFound";
  return false;
}

async function post(url: string, body: string) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  return { status: r.status, text: await r.text() };
}

/** Forward a JSON-RPC body (single or batch) to devnet; retry reads that come back empty. */
export async function devnetRpc(body: string): Promise<{ status: number; text: string }> {
  let calls: any[] = [];
  try {
    const parsed = JSON.parse(body);
    calls = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    /* forwarded as-is */
  }
  const retryable = calls.length > 0 && calls.every((c) => READS.has(c?.method));
  let last = await post(helius(), body);
  if (!retryable) return last;
  for (const url of [helius(), helius(), PUBLIC]) {
    let res: any;
    try {
      res = JSON.parse(last.text);
    } catch {
      res = null;
    }
    const list = Array.isArray(res) ? res : [res];
    if (last.status === 200 && res && !calls.some((c, i) => looksEmpty(c, list[i]))) return last;
    last = await post(url, body);
  }
  return last;
}

/** A server-side Connection that goes through devnetRpc. */
export function devnetConnection() {
  return new Connection(PUBLIC, {
    commitment: "confirmed",
    fetch: (async (_url: any, init: any) => {
      const { status, text } = await devnetRpc(String(init?.body ?? ""));
      return new Response(text, { status, headers: { "content-type": "application/json" } });
    }) as any,
  });
}
