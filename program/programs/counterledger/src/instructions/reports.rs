use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::*};

#[event]
pub struct ReportPosted {
    pub exchange: Pubkey,
    pub kind: u8, // 0 heartbeat, 1 score
    pub value: u16,
    pub as_of: i64,
    pub evidence_hash: [u8; 32],
}

#[derive(Accounts)]
pub struct PostReport<'info> {
    pub observer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = observer @ ErrorCode::NotObserver)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
}

fn check_time(prev: &Report, as_of: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(as_of >= prev.as_of, ErrorCode::StaleReport);
    require!(as_of <= now + 300, ErrorCode::OutOfRange);
    Ok(())
}

/// Heartbeat state from the observer's evidence JSON (evidence/heartbeat/<exchange>.json); its sha256 goes on-chain.
pub fn handle_post_heartbeat(ctx: Context<PostReport>, value: u16, as_of: i64, evidence_hash: [u8; 32]) -> Result<()> {
    require!(value <= HB_HALT_CONFIRMED, ErrorCode::OutOfRange);
    let ex = &mut ctx.accounts.exchange;
    check_time(&ex.heartbeat, as_of)?;
    ex.heartbeat = Report { value, as_of, evidence_hash };
    emit!(ReportPosted { exchange: ex.key(), kind: 0, value, as_of, evidence_hash });
    Ok(())
}

/// Score 0..=100 from the published formula; `verify` recomputes it from the evidence JSON whose hash is posted.
pub fn handle_post_score(ctx: Context<PostReport>, value: u16, as_of: i64, evidence_hash: [u8; 32]) -> Result<()> {
    require!(value <= 100, ErrorCode::OutOfRange);
    let ex = &mut ctx.accounts.exchange;
    check_time(&ex.score, as_of)?;
    ex.score = Report { value, as_of, evidence_hash };
    emit!(ReportPosted { exchange: ex.key(), kind: 1, value, as_of, evidence_hash });
    Ok(())
}
