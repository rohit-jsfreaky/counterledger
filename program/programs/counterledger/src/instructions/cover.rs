//! Cover market: per-exchange pools of devnet test-USDC. A protocol demo, not insurance (said in the README + UI).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{constants::*, error::ErrorCode, state::*};

#[event]
pub struct CoverBought {
    pub pool: Pubkey,
    pub cover: Pubkey,
    pub notional: u64,
    pub premium: u64,
    pub rate_bps: u64,
    pub expiry: i64,
}

#[event]
pub struct TriggerChanged {
    pub pool: Pubkey,
    pub state: u8, // 1 opened, 2 cancelled, 3 final
    pub at: i64,
}

#[event]
pub struct CoverPaid {
    pub pool: Pubkey,
    pub cover: Pubkey,
    pub amount: u64,
}

fn pool_signer_transfer<'info>(
    token_program: &Program<'info, Token>,
    pool: &Account<'info, Pool>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    amount: u64,
) -> Result<()> {
    let exchange = pool.exchange;
    let bump = [pool.bump];
    let seeds: &[&[u8]] = &[POOL_SEED, exchange.as_ref(), &bump];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi = CpiContext::new_with_signer(
        token_program.key(),
        Transfer { from: vault.to_account_info(), to: to.to_account_info(), authority: pool.to_account_info() },
        signer,
    );
    token::transfer(cpi, amount)
}

// ---------------------------------------------------------------------------------------------------------- pool

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ErrorCode::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(init, payer = admin, space = 8 + Pool::INIT_SPACE, seeds = [POOL_SEED, exchange.key().as_ref()], bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED, pool.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_pool(ctx: Context<CreatePool>, cap_bps: u16, base_rate_bps: u16) -> Result<()> {
    require!(cap_bps as u64 <= BPS && cap_bps > 0, ErrorCode::OutOfRange);
    let p = &mut ctx.accounts.pool;
    p.exchange = ctx.accounts.exchange.key();
    p.vault = ctx.accounts.vault.key();
    p.cap_bps = cap_bps;
    p.base_rate_bps = base_rate_bps;
    p.bump = ctx.bumps.pool;
    p.vault_bump = ctx.bumps.vault;
    Ok(())
}

// ------------------------------------------------------------------------------------------------------------ LP

#[derive(Accounts)]
pub struct LpDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [POOL_SEED, pool.exchange.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [LP_SEED, pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, LpPosition>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_lp_deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    let pool = &ctx.accounts.pool;
    require!(pool.trigger_opened_at == 0 && pool.triggered_at == 0, ErrorCode::TriggerActive);
    let shares = if pool.total_shares == 0 || pool.assets == 0 {
        amount
    } else {
        (amount as u128 * pool.total_shares as u128 / pool.assets as u128) as u64
    };
    require!(shares > 0, ErrorCode::ZeroAmount);
    let cpi = CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.owner_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(cpi, amount)?;

    let pos = &mut ctx.accounts.position;
    pos.pool = ctx.accounts.pool.key();
    pos.owner = ctx.accounts.owner.key();
    pos.bump = ctx.bumps.position;
    pos.shares = pos.shares.checked_add(shares).ok_or(ErrorCode::Overflow)?;
    let pool = &mut ctx.accounts.pool;
    pool.total_shares = pool.total_shares.checked_add(shares).ok_or(ErrorCode::Overflow)?;
    pool.assets = pool.assets.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct LpWithdraw<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [POOL_SEED, pool.exchange.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut, seeds = [LP_SEED, pool.key().as_ref(), owner.key().as_ref()], bump = position.bump,
              has_one = owner)]
    pub position: Account<'info, LpPosition>,
    pub token_program: Program<'info, Token>,
}

/// No withdrawals while a trigger is pending or final, and never below live exposure.
pub fn handle_lp_withdraw(ctx: Context<LpWithdraw>, shares: u64) -> Result<()> {
    require!(shares > 0 && shares <= ctx.accounts.position.shares, ErrorCode::OutOfRange);
    let pool = &ctx.accounts.pool;
    require!(pool.trigger_opened_at == 0 && pool.triggered_at == 0, ErrorCode::TriggerActive);
    let amount = (shares as u128 * pool.assets as u128 / pool.total_shares as u128) as u64;
    let free = pool.assets.saturating_sub(pool.exposure);
    require!(amount <= free, ErrorCode::InsufficientFree);
    pool_signer_transfer(&ctx.accounts.token_program, pool, &ctx.accounts.vault, &ctx.accounts.owner_token, amount)?;
    ctx.accounts.position.shares -= shares;
    let pool = &mut ctx.accounts.pool;
    pool.total_shares -= shares;
    pool.assets -= amount;
    Ok(())
}

// --------------------------------------------------------------------------------------------------------- cover

#[derive(Accounts)]
#[instruction(notional: u64, days: u16, index: u64)]
pub struct BuyCover<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut, seeds = [POOL_SEED, exchange.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + Cover::INIT_SPACE,
        seeds = [COVER_SEED, pool.key().as_ref(), &index.to_le_bytes()],
        bump
    )]
    pub cover: Account<'info, Cover>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Annual rate (bps) = base + (100 - score) x RATE_BPS_PER_SCORE_POINT + utilisation_bps / UTIL_DIVISOR.
pub fn quote(pool: &Pool, score: u16, notional: u64, days: u16) -> Result<(u64, u64)> {
    let new_exposure = pool.exposure.checked_add(notional).ok_or(ErrorCode::Overflow)?;
    require!(pool.assets > 0, ErrorCode::ExposureCap);
    require!(
        new_exposure as u128 * BPS as u128 <= pool.assets as u128 * pool.cap_bps as u128,
        ErrorCode::ExposureCap
    );
    let util_bps = (new_exposure as u128 * BPS as u128 / pool.assets as u128) as u64;
    let rate = pool.base_rate_bps as u64 + (100 - score.min(100)) as u64 * RATE_BPS_PER_SCORE_POINT + util_bps / UTIL_DIVISOR;
    let num = notional as u128 * rate as u128 * days as u128;
    let den = 365u128 * BPS as u128;
    let premium = ((num + den - 1) / den).max(1) as u64;
    Ok((premium, rate))
}

pub fn handle_buy_cover(ctx: Context<BuyCover>, notional: u64, days: u16, index: u64) -> Result<()> {
    require!(notional > 0, ErrorCode::ZeroAmount);
    require!((1..=365).contains(&days), ErrorCode::OutOfRange);
    let ex = &ctx.accounts.exchange;
    require!(ex.score.as_of > 0, ErrorCode::NoScore);
    require!(
        ex.heartbeat.value != HB_BELOW_USUAL && ex.heartbeat.value != HB_HALT_CONFIRMED,
        ErrorCode::HaltSignalActive
    );
    let pool = &ctx.accounts.pool;
    require!(pool.trigger_opened_at == 0 && pool.triggered_at == 0, ErrorCode::TriggerActive);
    require!(index == pool.covers_sold, ErrorCode::OutOfRange);
    let (premium, rate) = quote(pool, ex.score.value, notional, days)?;

    let cpi = CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.owner_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(cpi, premium)?;

    let now = Clock::get()?.unix_timestamp;
    let c = &mut ctx.accounts.cover;
    c.pool = ctx.accounts.pool.key();
    c.owner = ctx.accounts.owner.key();
    c.index = index;
    c.notional = notional;
    c.premium = premium;
    c.start = now;
    c.expiry = now + days as i64 * 86_400;
    c.bump = ctx.bumps.cover;
    let pool = &mut ctx.accounts.pool;
    pool.assets = pool.assets.checked_add(premium).ok_or(ErrorCode::Overflow)?;
    pool.exposure = pool.exposure.checked_add(notional).ok_or(ErrorCode::Overflow)?;
    pool.covers_sold += 1;
    emit!(CoverBought { pool: pool.key(), cover: c.key(), notional, premium, rate_bps: rate, expiry: c.expiry });
    Ok(())
}

// ------------------------------------------------------------------------------------------------------- trigger

#[derive(Accounts)]
pub struct OpenTrigger<'info> {
    pub observer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = observer @ ErrorCode::NotObserver)]
    pub config: Account<'info, Config>,
    #[account(seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut, seeds = [POOL_SEED, exchange.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
}

/// Opens a trigger only when the posted heartbeat says HALT_CONFIRMED (data/cover-params.json rule).
pub fn handle_open_trigger(ctx: Context<OpenTrigger>, evidence_hash: [u8; 32]) -> Result<()> {
    require!(ctx.accounts.exchange.heartbeat.value == HB_HALT_CONFIRMED, ErrorCode::NoHalt);
    let pool = &mut ctx.accounts.pool;
    require!(pool.trigger_opened_at == 0 && pool.triggered_at == 0, ErrorCode::TriggerActive);
    let now = Clock::get()?.unix_timestamp;
    pool.trigger_opened_at = now;
    pool.trigger_evidence = evidence_hash;
    emit!(TriggerChanged { pool: pool.key(), state: 1, at: now });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelTrigger<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ErrorCode::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [POOL_SEED, pool.exchange.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
}

/// The challenge: inside the window a wrong trigger can be cancelled.
pub fn handle_cancel_trigger(ctx: Context<CancelTrigger>) -> Result<()> {
    let window = ctx.accounts.config.challenge_window_secs;
    let pool = &mut ctx.accounts.pool;
    require!(pool.trigger_opened_at > 0 && pool.triggered_at == 0, ErrorCode::NoTrigger);
    let now = Clock::get()?.unix_timestamp;
    require!(now < pool.trigger_opened_at + window, ErrorCode::ChallengeOver);
    pool.trigger_opened_at = 0;
    pool.trigger_evidence = [0u8; 32];
    emit!(TriggerChanged { pool: pool.key(), state: 2, at: now });
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeTrigger<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
    #[account(mut, seeds = [POOL_SEED, exchange.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
}

/// Anyone can finalize once the window passed and the halt still stands.
pub fn handle_finalize_trigger(ctx: Context<FinalizeTrigger>) -> Result<()> {
    require!(ctx.accounts.exchange.heartbeat.value == HB_HALT_CONFIRMED, ErrorCode::NoHalt);
    let window = ctx.accounts.config.challenge_window_secs;
    let pool = &mut ctx.accounts.pool;
    require!(pool.trigger_opened_at > 0 && pool.triggered_at == 0, ErrorCode::NoTrigger);
    let now = Clock::get()?.unix_timestamp;
    require!(now >= pool.trigger_opened_at + window, ErrorCode::ChallengeWindow);
    pool.triggered_at = pool.trigger_opened_at;
    emit!(TriggerChanged { pool: pool.key(), state: 3, at: now });
    Ok(())
}

// --------------------------------------------------------------------------------------------------- settlement

#[derive(Accounts)]
pub struct ClaimCover<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [POOL_SEED, pool.exchange.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut, seeds = [COVER_SEED, pool.key().as_ref(), &cover.index.to_le_bytes()], bump = cover.bump,
              has_one = owner, has_one = pool)]
    pub cover: Account<'info, Cover>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_cover(ctx: Context<ClaimCover>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let c = &ctx.accounts.cover;
    require!(pool.triggered_at > 0, ErrorCode::NoTrigger);
    require!(!c.claimed && !c.expired, ErrorCode::CoverSettled);
    require!(c.start <= pool.triggered_at && pool.triggered_at <= c.expiry, ErrorCode::CoverNotActive);
    let amount = c.notional.min(pool.assets);
    pool_signer_transfer(&ctx.accounts.token_program, pool, &ctx.accounts.vault, &ctx.accounts.owner_token, amount)?;
    let notional = c.notional;
    let pool = &mut ctx.accounts.pool;
    pool.assets -= amount;
    pool.exposure = pool.exposure.saturating_sub(notional);
    ctx.accounts.cover.claimed = true;
    emit!(CoverPaid { pool: pool.key(), cover: ctx.accounts.cover.key(), amount });
    Ok(())
}

#[derive(Accounts)]
pub struct ExpireCover<'info> {
    #[account(mut, seeds = [POOL_SEED, pool.exchange.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [COVER_SEED, pool.key().as_ref(), &cover.index.to_le_bytes()], bump = cover.bump,
              has_one = pool)]
    pub cover: Account<'info, Cover>,
}

/// Frees exposure of a cover that ended without a trigger in its window. Permissionless.
pub fn handle_expire_cover(ctx: Context<ExpireCover>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pool = &ctx.accounts.pool;
    let c = &ctx.accounts.cover;
    require!(!c.claimed && !c.expired, ErrorCode::CoverSettled);
    require!(now > c.expiry, ErrorCode::CoverLive);
    let covered = pool.triggered_at > 0 && c.start <= pool.triggered_at && pool.triggered_at <= c.expiry;
    require!(!covered, ErrorCode::CoverLive);
    let notional = c.notional;
    ctx.accounts.pool.exposure = ctx.accounts.pool.exposure.saturating_sub(notional);
    ctx.accounts.cover.expired = true;
    Ok(())
}
