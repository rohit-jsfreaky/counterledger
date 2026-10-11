use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const EXCHANGE_SEED: &[u8] = b"exchange";
#[constant]
pub const BUFFER_SEED: &[u8] = b"claims";
#[constant]
pub const PROOF_SEED: &[u8] = b"proof";
#[constant]
pub const POOL_SEED: &[u8] = b"pool";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const LP_SEED: &[u8] = b"lp";
#[constant]
pub const COVER_SEED: &[u8] = b"cover";

/// One proof per account per 30-day epoch (epoch = claim timestamp / EPOCH_SECS).
pub const EPOCH_SECS: i64 = 30 * 86_400;
/// A claim older than this is refused (stale balances do not count).
pub const MAX_PROOF_AGE_SECS: i64 = 7 * 86_400;
/// Proven amounts are stored with 6 decimals (1.5 USDT = 1_500_000).
pub const AMOUNT_DECIMALS: u32 = 6;

pub const MAX_ATTESTORS: usize = 4;
pub const MAX_PROVIDER_HASHES: usize = 4;
pub const MAX_ASSETS: usize = 8;
pub const MAX_CLAIM_BUFFER: u32 = 8_000;
pub const ASSET_LEN: usize = 12;

pub const BPS: u64 = 10_000;
/// Cover price: base rate + this many bps per score point below 100 + utilisation / UTIL_DIVISOR.
pub const RATE_BPS_PER_SCORE_POINT: u64 = 30;
pub const UTIL_DIVISOR: u64 = 5;

// Heartbeat states posted by the observer (same names as evidence/heartbeat/*.json).
pub const HB_UNKNOWN: u16 = 0;
pub const HB_NORMAL: u16 = 1;
pub const HB_BELOW_USUAL: u16 = 2;
pub const HB_NOT_ENOUGH_DATA: u16 = 3;
pub const HB_HALT_CONFIRMED: u16 = 4;
