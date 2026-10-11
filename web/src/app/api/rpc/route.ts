import { devnetRpc } from "@/lib/devnet-rpc";

// Devnet JSON-RPC proxy: the Helius key stays on the server. Only read/send methods a browser wallet flow needs.
const ALLOWED = new Set([
  "getLatestBlockhash", "isBlockhashValid", "sendTransaction", "simulateTransaction", "getSignatureStatuses",
  "getAccountInfo", "getMultipleAccounts", "getBalance", "getTokenAccountBalance", "getTokenAccountsByOwner",
  "getMinimumBalanceForRentExemption", "getSlot", "getBlockHeight", "getBlockTime", "getEpochInfo", "getVersion",
  "getGenesisHash", "getFeeForMessage", "getRecentPrioritizationFees", "getTransaction", "getSignaturesForAddress",
]);

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > 20 || calls.some((c) => !ALLOWED.has(c?.method))) {
    return Response.json({ jsonrpc: "2.0", id: calls[0]?.id ?? null, error: { code: -32601, message: "method not allowed" } }, { status: 403 });
  }
  const r = await devnetRpc(JSON.stringify(body));
  return new Response(r.text, { status: r.status, headers: { "content-type": "application/json" } });
}
