// Creates a Reclaim proof request bound to the user's wallet (context address). The app secret never leaves the server.
import { PublicKey } from "@solana/web3.js";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { PROVIDERS } from "@/lib/providers";

const EPOCH_SECS = 30 * 86400;

export async function POST(req: Request) {
  const { wallet, exchange } = await req.json().catch(() => ({}));
  const provider = PROVIDERS.find((p) => p.exchange === exchange && p.recordable);
  if (!provider) return Response.json({ error: "no recordable provider for this exchange" }, { status: 400 });
  try {
    new PublicKey(wallet);
  } catch {
    return Response.json({ error: "bad wallet" }, { status: 400 });
  }
  const appId = process.env.RECLAIM_APP_ID;
  const secret = process.env.RECLAIM_APP_SECRET;
  if (!appId || !secret) return Response.json({ error: "server is missing Reclaim credentials" }, { status: 500 });

  const request = await ReclaimProofRequest.init(appId, secret, provider.providerId);
  const epoch = Math.floor(Date.now() / 1000 / EPOCH_SECS);
  request.setContext(wallet, JSON.stringify({ app: "counterledger", exchange, epoch }));
  return Response.json({ config: request.toJsonString(), providerId: provider.providerId, epoch });
}
