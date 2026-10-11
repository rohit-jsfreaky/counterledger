// The /break simulations: each one is a real transaction against the deployed program, simulated on devnet.
// Expected results were checked by running every attack (see PROGRESS.md, 11 Oct).
export const ATTACKS = [
  {
    id: "control",
    title: "Control: an honest report",
    tries: "The real observer re-posts the heartbeat that is already on-chain. This should pass, so you know the simulator isn't just rejecting everything.",
    guard: "none",
    expect: "Succeeded",
  },
  {
    id: "forged",
    title: "Edit a real proof to claim 250,000 USDT",
    tries: "An attacker takes the CoinDCX claims recorded on devnet, edits the balance to 250,000 and binds them to their own wallet, then reuses Reclaim's signatures.",
    guard: "the program recomputes the claim id and recovers the secp256k1 signer; it must be a trusted Reclaim attestor",
    expect: "UntrustedAttestor",
  },
  {
    id: "replay",
    title: "Count the same account twice",
    tries: "Re-submit an already recorded proof with its nullifier, to inflate the floor.",
    guard: "one proof record per (exchange, nullifier); the nullifier is a hash of the hashed account id and the epoch",
    expect: "AccountAlreadyInUse",
  },
  {
    id: "steal",
    title: "Submit someone else's proof from your wallet",
    tries: "Use the real, unedited claims from a different wallet with a fresh nullifier.",
    guard: "claims expire after 7 days (checked first), and the claim's context address must equal the signing wallet",
    expect: "WrongProver / StaleClaim",
  },
  {
    id: "impostor",
    title: "Post a perfect score as a stranger",
    tries: "Any wallet tries to post score 100 for CoinDCX.",
    guard: "only the configured observer key can post reports (a single signer in v1)",
    expect: "NotObserver",
  },
  {
    id: "stale",
    title: "Roll the heartbeat back a day",
    tries: "The observer key posts a heartbeat older than the one on-chain, to hide a newer state.",
    guard: "reports only move forward in time",
    expect: "StaleReport",
  },
  {
    id: "overcap",
    title: "Buy more cover than the pool can pay",
    tries: "Buy cover equal to 100% of the CoinDCX pool's assets.",
    guard: "live cover can't exceed 50% of pool assets",
    expect: "ExposureCap",
  },
  {
    id: "halt",
    title: "Buy cover after the halt is known",
    tries: "Buy cover on the FTX replay exchange, whose heartbeat already shows a confirmed halt.",
    guard: "no cover is sold while the heartbeat is below its usual pattern or halted",
    expect: "HaltSignalActive",
  },
];
