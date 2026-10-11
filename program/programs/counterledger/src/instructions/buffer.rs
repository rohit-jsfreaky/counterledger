use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(capacity: u32)]
pub struct OpenClaimBuffer<'info> {
    #[account(mut)]
    pub prover: Signer<'info>,
    #[account(
        init,
        payer = prover,
        space = ClaimBuffer::space(capacity),
        seeds = [BUFFER_SEED, prover.key().as_ref()],
        bump
    )]
    pub buffer: Account<'info, ClaimBuffer>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_claim_buffer(ctx: Context<OpenClaimBuffer>, capacity: u32) -> Result<()> {
    require!(capacity >= 4 && capacity <= MAX_CLAIM_BUFFER, ErrorCode::OutOfRange);
    let b = &mut ctx.accounts.buffer;
    b.owner = ctx.accounts.prover.key();
    b.data = vec![0u8; capacity as usize];
    Ok(())
}

#[derive(Accounts)]
pub struct WriteClaimBuffer<'info> {
    pub prover: Signer<'info>,
    #[account(mut, seeds = [BUFFER_SEED, prover.key().as_ref()], bump, constraint = buffer.owner == prover.key())]
    pub buffer: Account<'info, ClaimBuffer>,
}

pub fn handle_write_claim_buffer(ctx: Context<WriteClaimBuffer>, offset: u32, bytes: Vec<u8>) -> Result<()> {
    let data = &mut ctx.accounts.buffer.data;
    let start = offset as usize;
    let end = start.checked_add(bytes.len()).ok_or(ErrorCode::BufferOutOfRange)?;
    require!(end <= data.len(), ErrorCode::BufferOutOfRange);
    data[start..end].copy_from_slice(&bytes);
    Ok(())
}

#[derive(Accounts)]
pub struct CloseClaimBuffer<'info> {
    #[account(mut)]
    pub prover: Signer<'info>,
    #[account(mut, close = prover, seeds = [BUFFER_SEED, prover.key().as_ref()], bump,
              constraint = buffer.owner == prover.key())]
    pub buffer: Account<'info, ClaimBuffer>,
}

/// Abandon an upload and get the rent back.
pub fn handle_close_claim_buffer(_ctx: Context<CloseClaimBuffer>) -> Result<()> {
    Ok(())
}
