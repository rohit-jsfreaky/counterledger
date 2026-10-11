use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    ctx: Context<Initialize>,
    observer: Pubkey,
    attestors: Vec<[u8; 20]>,
    challenge_window_secs: i64,
) -> Result<()> {
    require!(attestors.len() <= MAX_ATTESTORS, ErrorCode::TooMany);
    require!(challenge_window_secs >= 0, ErrorCode::OutOfRange);
    let c = &mut ctx.accounts.config;
    c.admin = ctx.accounts.admin.key();
    c.observer = observer;
    c.attestors = attestors;
    c.usdc_mint = ctx.accounts.usdc_mint.key();
    c.challenge_window_secs = challenge_window_secs;
    c.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ErrorCode::NotAdmin)]
    pub config: Account<'info, Config>,
}

pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    observer: Pubkey,
    attestors: Vec<[u8; 20]>,
    challenge_window_secs: i64,
) -> Result<()> {
    require!(attestors.len() <= MAX_ATTESTORS, ErrorCode::TooMany);
    require!(challenge_window_secs >= 0, ErrorCode::OutOfRange);
    let c = &mut ctx.accounts.config;
    c.observer = observer;
    c.attestors = attestors;
    c.challenge_window_secs = challenge_window_secs;
    Ok(())
}

#[derive(Accounts)]
#[instruction(id: String)]
pub struct AddExchange<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ErrorCode::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + Exchange::INIT_SPACE,
        seeds = [EXCHANGE_SEED, id.as_bytes()],
        bump
    )]
    pub exchange: Account<'info, Exchange>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_exchange(
    ctx: Context<AddExchange>,
    id: String,
    name: String,
    provider_hashes: Vec<[u8; 32]>,
) -> Result<()> {
    require!(id.len() <= 16 && name.len() <= 32, ErrorCode::TooLong);
    require!(provider_hashes.len() <= MAX_PROVIDER_HASHES, ErrorCode::TooMany);
    let e = &mut ctx.accounts.exchange;
    e.id = id;
    e.name = name;
    e.provider_hashes = provider_hashes;
    e.bump = ctx.bumps.exchange;
    Ok(())
}

#[derive(Accounts)]
pub struct SetProviderHashes<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ErrorCode::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [EXCHANGE_SEED, exchange.id.as_bytes()], bump = exchange.bump)]
    pub exchange: Account<'info, Exchange>,
}

/// A new Reclaim provider version has a new provider hash; the admin lists which ones count.
pub fn handle_set_provider_hashes(ctx: Context<SetProviderHashes>, provider_hashes: Vec<[u8; 32]>) -> Result<()> {
    require!(provider_hashes.len() <= MAX_PROVIDER_HASHES, ErrorCode::TooMany);
    ctx.accounts.exchange.provider_hashes = provider_hashes;
    Ok(())
}
