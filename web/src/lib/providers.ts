// Reclaim providers we offer. "recordable" = its provider hashes are accepted by the exchange account on devnet.
export const PROVIDERS = [
  {
    exchange: "coindcx",
    name: "CoinDCX",
    providerId: "2d2421ec-43bf-4ab4-a1b9-2eb13cc963e6",
    recordable: true,
    note: "Built by us with Reclaim's provider agent. Proves your coin + wallet balance and an OPRF-hashed account id.",
  },
  {
    exchange: "binance",
    name: "Binance",
    providerId: "fbf83028-fbed-4414-b593-fa5d3e3fa131",
    recordable: false,
    note: "Community provider on Reclaim (balance + uid). Not tested by us and not yet accepted on devnet.",
  },
] as const;
