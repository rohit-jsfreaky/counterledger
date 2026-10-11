use std::str::FromStr;

use anchor_lang::prelude::*;

use crate::{
    claim::{self, SignedClaimArgs},
    constants::*,
    error::ErrorCode,
    state::*,
};

#[event]
pub struct ProofRecorded {
    pub exchange: Pubkey,
    pub nullifier: [u8; 32],
    pub asset: [u8; ASSET_LEN],
    pub bucket: u8,
    pub epoch: u32,
    pub floor_amount: u64,
    pub floor_provers: u32,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32])]
pub struct RecordProof<'info> {
    #[account(mut)]
    pub prover: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut, close = prover, seeds = [BUFFER_SEED, prover.key().as_ref()], bump,
              constraint = buffer.owner == prover.key())]
    pub buffer: Account<'info, ClaimBuffer>,
    /// One record per (exchange, nullifier): a second proof from the same account in the same epoch fails here.
    #[account(
        init,
        payer = prover,
        space = 8 + ProofRecord::INIT_SPACE,
        seeds = [PROOF_SEED, exchange.key().as_ref(), nullifier.as_ref()],
        bump
    )]
    pub proof_record: Account<'info, ProofRecord>,
    pub system_program: Program<'info, System>,
}

/// Records a balance proof: two Reclaim claims from one verification (hashed account id + asset/balance), both
/// signed by a trusted attestor, made with an accepted provider, bound to this wallet, and fresh.
pub fn handle_record_proof(ctx: Context<RecordProof>, nullifier: [u8; 32], claims: Vec<SignedClaimArgs>) -> Result<()> {
    require!(claims.len() == 2, ErrorCode::WrongClaimCount);
    let now = Clock::get()?.unix_timestamp;
    let prover = ctx.accounts.prover.key();
    let infos = claim::parse_buffer(&ctx.accounts.buffer.data)?;
    let exchange = &ctx.accounts.exchange;

    let mut account_hash: Option<Vec<u8>> = None;
    let mut asset_amount: Option<([u8; ASSET_LEN], u64)> = None;
    let mut ids = [[0u8; 32]; 2];
    let mut epochs = [0u32; 2];

    for (i, (info, signed)) in infos.iter().zip(claims.iter()).enumerate() {
        let id = claim::identifier(info);
        ids[i] = id;
        let signer = claim::recover_attestor(&id, signed)?;
        require!(ctx.accounts.config.attestors.contains(&signer), ErrorCode::UntrustedAttestor);

        let ts = signed.timestamp_s as i64;
        require!(ts <= now + 300, ErrorCode::FutureClaim);
        require!(now - ts <= MAX_PROOF_AGE_SECS, ErrorCode::StaleClaim);
        epochs[i] = (ts / EPOCH_SECS) as u32;

        let fields = claim::context_fields(info.context)?;
        let addr = core::str::from_utf8(fields.context_address).map_err(|_| error!(ErrorCode::BadContext))?;
        let bound = Pubkey::from_str(addr).map_err(|_| error!(ErrorCode::BadContext))?;
        require_keys_eq!(bound, prover, ErrorCode::WrongProver);
        require!(exchange.provider_hashes.contains(&fields.provider_hash), ErrorCode::UnknownProvider);

        if let Some(a) = claim::extracted(info.context, &fields, "account_id") {
            account_hash = Some(a.to_vec());
        }
        if let (Some(a), Some(b)) = (
            claim::extracted(info.context, &fields, "asset"),
            claim::extracted(info.context, &fields, "wallet_balance"),
        ) {
            asset_amount = Some((claim::asset_key(a)?, claim::parse_amount(b)?));
        }
    }
    require!(epochs[0] == epochs[1], ErrorCode::EpochMismatch);
    let account_hash = account_hash.ok_or(ErrorCode::BadContext)?;
    let (asset, amount) = asset_amount.ok_or(ErrorCode::BadContext)?;
    let expected = claim::nullifier(&exchange.id, &account_hash, epochs[0]);
    require!(expected == nullifier, ErrorCode::BadContext);

    let rec = &mut ctx.accounts.proof_record;
    rec.exchange = ctx.accounts.exchange.key();
    rec.prover = prover;
    rec.nullifier = nullifier;
    rec.asset = asset;
    rec.bucket = claim::bucket(amount);
    rec.epoch = epochs[0];
    rec.claim_ids = ids;
    rec.recorded_at = now;
    rec.bump = ctx.bumps.proof_record;

    let ex = &mut ctx.accounts.exchange;
    let idx = match ex.floors.iter().position(|f| f.asset == asset) {
        Some(i) => i,
        None => {
            require!(ex.floors.len() < MAX_ASSETS, ErrorCode::TooMany);
            ex.floors.push(AssetFloor { asset, amount: 0, provers: 0 });
            ex.floors.len() - 1
        }
    };
    let floor_amount = ex.floors[idx].amount.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    let floor_provers = ex.floors[idx].provers.checked_add(1).ok_or(ErrorCode::Overflow)?;
    ex.floors[idx].amount = floor_amount;
    ex.floors[idx].provers = floor_provers;
    ex.prover_count = ex.prover_count.checked_add(1).ok_or(ErrorCode::Overflow)?;

    emit!(ProofRecorded {
        exchange: rec.exchange,
        nullifier,
        asset,
        bucket: rec.bucket,
        epoch: rec.epoch,
        floor_amount,
        floor_provers,
    });
    Ok(())
}
