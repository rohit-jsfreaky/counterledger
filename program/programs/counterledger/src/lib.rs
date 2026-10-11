//! Counterledger — the users' side of every exchange's books, on Solana devnet.
//! Users prove what their exchange shows them (Reclaim zkTLS claims, checked here), the observer posts a withdrawal
//! heartbeat and a recomputable score, and per-exchange cover pools are priced by the score and paid when a halt is
//! confirmed. Devnet + test-USDC only; a protocol demo, not insurance.

pub mod claim;
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use claim::SignedClaimArgs;
pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5DCUGtXcR4DcBi7FpyRv1fGtUS3zTHJy9kXoDH8yxG9K");

#[program]
pub mod counterledger {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        observer: Pubkey,
        attestors: Vec<[u8; 20]>,
        challenge_window_secs: i64,
    ) -> Result<()> {
        admin::handle_initialize(ctx, observer, attestors, challenge_window_secs)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        observer: Pubkey,
        attestors: Vec<[u8; 20]>,
        challenge_window_secs: i64,
    ) -> Result<()> {
        admin::handle_update_config(ctx, observer, attestors, challenge_window_secs)
    }

    pub fn add_exchange(ctx: Context<AddExchange>, id: String, name: String, provider_hashes: Vec<[u8; 32]>) -> Result<()> {
        admin::handle_add_exchange(ctx, id, name, provider_hashes)
    }

    pub fn set_provider_hashes(ctx: Context<SetProviderHashes>, provider_hashes: Vec<[u8; 32]>) -> Result<()> {
        admin::handle_set_provider_hashes(ctx, provider_hashes)
    }

    pub fn open_claim_buffer(ctx: Context<OpenClaimBuffer>, capacity: u32) -> Result<()> {
        buffer::handle_open_claim_buffer(ctx, capacity)
    }

    pub fn write_claim_buffer(ctx: Context<WriteClaimBuffer>, offset: u32, bytes: Vec<u8>) -> Result<()> {
        buffer::handle_write_claim_buffer(ctx, offset, bytes)
    }

    pub fn close_claim_buffer(ctx: Context<CloseClaimBuffer>) -> Result<()> {
        buffer::handle_close_claim_buffer(ctx)
    }

    pub fn record_proof(ctx: Context<RecordProof>, nullifier: [u8; 32], claims: Vec<SignedClaimArgs>) -> Result<()> {
        record_proof::handle_record_proof(ctx, nullifier, claims)
    }

    pub fn post_heartbeat(ctx: Context<PostReport>, value: u16, as_of: i64, evidence_hash: [u8; 32]) -> Result<()> {
        reports::handle_post_heartbeat(ctx, value, as_of, evidence_hash)
    }

    pub fn post_score(ctx: Context<PostReport>, value: u16, as_of: i64, evidence_hash: [u8; 32]) -> Result<()> {
        reports::handle_post_score(ctx, value, as_of, evidence_hash)
    }

    pub fn create_pool(ctx: Context<CreatePool>, cap_bps: u16, base_rate_bps: u16) -> Result<()> {
        cover::handle_create_pool(ctx, cap_bps, base_rate_bps)
    }

    pub fn lp_deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
        cover::handle_lp_deposit(ctx, amount)
    }

    pub fn lp_withdraw(ctx: Context<LpWithdraw>, shares: u64) -> Result<()> {
        cover::handle_lp_withdraw(ctx, shares)
    }

    pub fn buy_cover(ctx: Context<BuyCover>, notional: u64, days: u16, index: u64) -> Result<()> {
        cover::handle_buy_cover(ctx, notional, days, index)
    }

    pub fn open_trigger(ctx: Context<OpenTrigger>, evidence_hash: [u8; 32]) -> Result<()> {
        cover::handle_open_trigger(ctx, evidence_hash)
    }

    pub fn cancel_trigger(ctx: Context<CancelTrigger>) -> Result<()> {
        cover::handle_cancel_trigger(ctx)
    }

    pub fn finalize_trigger(ctx: Context<FinalizeTrigger>) -> Result<()> {
        cover::handle_finalize_trigger(ctx)
    }

    pub fn claim_cover(ctx: Context<ClaimCover>) -> Result<()> {
        cover::handle_claim_cover(ctx)
    }

    pub fn expire_cover(ctx: Context<ExpireCover>) -> Result<()> {
        cover::handle_expire_cover(ctx)
    }
}
