use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Posts heartbeat + score reports. A single signer in v1 — said out loud in the README.
    pub observer: Pubkey,
    /// Ethereum addresses of the Reclaim attestors whose claim signatures are accepted.
    #[max_len(MAX_ATTESTORS)]
    pub attestors: Vec<[u8; 20]>,
    /// Devnet test-USDC mint used by every cover pool.
    pub usdc_mint: Pubkey,
    /// Time between a trigger opening and becoming final, during which it can be cancelled.
    pub challenge_window_secs: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, InitSpace)]
pub struct AssetFloor {
    /// Ticker, zero-padded (e.g. "USDT").
    pub asset: [u8; ASSET_LEN],
    /// Sum of proven balances, 6 decimals. A minimum, not the total.
    pub amount: u64,
    pub provers: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, InitSpace)]
pub struct Report {
    pub value: u16,
    pub as_of: i64,
    /// sha256 of the evidence JSON in the repo; `verify` recomputes it.
    pub evidence_hash: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct Exchange {
    #[max_len(16)]
    pub id: String,
    #[max_len(32)]
    pub name: String,
    /// Reclaim provider hashes (claim context `providerHash`) accepted as proofs for this exchange.
    #[max_len(MAX_PROVIDER_HASHES)]
    pub provider_hashes: Vec<[u8; 32]>,
    pub prover_count: u32,
    #[max_len(MAX_ASSETS)]
    pub floors: Vec<AssetFloor>,
    pub heartbeat: Report,
    pub score: Report,
    pub bump: u8,
}

/// Holds the claim info (provider, parameters, context) of a proof while it is uploaded in chunks; one Solana
/// transaction is too small for it. Closed by record_proof.
#[account]
pub struct ClaimBuffer {
    pub owner: Pubkey,
    pub data: Vec<u8>,
}

impl ClaimBuffer {
    pub fn space(capacity: u32) -> usize {
        8 + 32 + 4 + capacity as usize
    }
}

#[account]
#[derive(InitSpace)]
pub struct ProofRecord {
    pub exchange: Pubkey,
    pub prover: Pubkey,
    /// keccak(domain, exchange id, hashed account id, epoch) — never the account id itself.
    pub nullifier: [u8; 32],
    pub asset: [u8; ASSET_LEN],
    /// Balance bucket: 0 <1, 1 <10, 2 <100, 3 <1k, 4 <10k, 5 >=10k (asset units).
    pub bucket: u8,
    pub epoch: u32,
    /// Reclaim claim identifiers of the proofs that made this record.
    pub claim_ids: [[u8; 32]; 2],
    pub recorded_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub exchange: Pubkey,
    pub vault: Pubkey,
    pub total_shares: u64,
    /// test-USDC the pool holds (deposits + premiums - withdrawals - payouts).
    pub assets: u64,
    /// Notional of live covers.
    pub exposure: u64,
    /// Max exposure as a share of assets.
    pub cap_bps: u16,
    pub base_rate_bps: u16,
    pub covers_sold: u64,
    pub trigger_opened_at: i64,
    pub triggered_at: i64,
    pub trigger_evidence: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Cover {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub index: u64,
    pub notional: u64,
    pub premium: u64,
    pub start: i64,
    pub expiry: i64,
    pub claimed: bool,
    pub expired: bool,
    pub bump: u8,
}
