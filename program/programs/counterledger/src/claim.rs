//! Reclaim claim checks, done inside the program so the floor never trusts a client-supplied number.
//!
//! A Reclaim claim is `identifier = keccak256(provider "\n" parameters "\n" canonical_context)`, signed by an attestor
//! over `identifier_hex "\n" owner "\n" timestampS "\n" epoch` with the Ethereum personal-message prefix
//! (@reclaimprotocol/js-sdk `createSignDataForClaim` + `ethers.verifyMessage`).

use anchor_lang::prelude::*;
use solana_keccak_hasher as keccak;
use solana_secp256k1_recover::secp256k1_recover;

use crate::constants::*;
use crate::error::ErrorCode;

/// The signed part of a claim, passed as an instruction argument (the long claim info lives in the buffer).
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SignedClaimArgs {
    pub owner: String,
    pub timestamp_s: u32,
    pub epoch: u32,
    pub signature: [u8; 65],
}

/// One claim's info as stored in the buffer: three length-prefixed byte strings.
pub struct ClaimInfo<'a> {
    pub provider: &'a [u8],
    pub parameters: &'a [u8],
    pub context: &'a [u8],
}

fn take<'a>(data: &'a [u8], at: &mut usize) -> Result<&'a [u8]> {
    let end4 = at.checked_add(4).ok_or(ErrorCode::BadBuffer)?;
    require!(end4 <= data.len(), ErrorCode::BadBuffer);
    let len = u32::from_le_bytes(data[*at..end4].try_into().unwrap()) as usize;
    let end = end4.checked_add(len).ok_or(ErrorCode::BadBuffer)?;
    require!(end <= data.len(), ErrorCode::BadBuffer);
    *at = end;
    Ok(&data[end4..end])
}

/// Buffer layout: u32 claim count, then per claim: [u32 len][provider][u32 len][parameters][u32 len][context].
pub fn parse_buffer(data: &[u8]) -> Result<Vec<ClaimInfo<'_>>> {
    require!(data.len() >= 4, ErrorCode::BadBuffer);
    let n = u32::from_le_bytes(data[0..4].try_into().unwrap()) as usize;
    require!(n == 2, ErrorCode::WrongClaimCount);
    let mut at = 4usize;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let provider = take(data, &mut at)?;
        let parameters = take(data, &mut at)?;
        let context = take(data, &mut at)?;
        out.push(ClaimInfo { provider, parameters, context });
    }
    Ok(out)
}

pub fn identifier(info: &ClaimInfo) -> [u8; 32] {
    keccak::hashv(&[info.provider, b"\n", info.parameters, b"\n", info.context]).to_bytes()
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 15) as usize] as char);
    }
    s
}

/// Ethereum address that signed this claim.
pub fn recover_attestor(id: &[u8; 32], signed: &SignedClaimArgs) -> Result<[u8; 20]> {
    let message = format!(
        "0x{}\n{}\n{}\n{}",
        hex_lower(id),
        signed.owner.to_lowercase(),
        signed.timestamp_s,
        signed.epoch
    );
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let digest = keccak::hashv(&[prefix.as_bytes(), message.as_bytes()]).to_bytes();
    let v = signed.signature[64];
    let recovery_id = if v >= 27 { v - 27 } else { v };
    require!(recovery_id <= 1, ErrorCode::BadSignature);
    let pubkey = secp256k1_recover(&digest, recovery_id, &signed.signature[..64])
        .map_err(|_| error!(ErrorCode::BadSignature))?;
    let hash = keccak::hash(&pubkey.to_bytes()).to_bytes();
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..]);
    Ok(addr)
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() || from > hay.len() - needle.len() {
        return None;
    }
    (from..=hay.len() - needle.len()).find(|&i| &hay[i..i + needle.len()] == needle)
}

/// Value of `"key":"<value>"` at the top level of the canonical context (values we read never contain quotes).
/// Keys inside contextMessage cannot match: they are JSON-escaped there (`\"key\"`).
fn string_field<'a>(ctx: &'a [u8], key: &str, from: usize) -> Option<&'a [u8]> {
    let pat = format!("\"{}\":\"", key);
    let start = find(ctx, pat.as_bytes(), from)? + pat.len();
    let len = ctx[start..].iter().position(|&c| c == b'"' || c == b'\\')?;
    if ctx[start + len] == b'\\' {
        return None; // escaped content is never a value we accept
    }
    Some(&ctx[start..start + len])
}

pub struct ContextFields<'a> {
    pub context_address: &'a [u8],
    pub provider_hash: [u8; 32],
    pub extracted_from: usize,
}

pub fn context_fields(ctx: &[u8]) -> Result<ContextFields<'_>> {
    let context_address = string_field(ctx, "contextAddress", 0).ok_or(ErrorCode::BadContext)?;
    let ph = string_field(ctx, "providerHash", 0).ok_or(ErrorCode::BadContext)?;
    require!(ph.len() == 66 && &ph[..2] == b"0x", ErrorCode::BadContext);
    let mut provider_hash = [0u8; 32];
    for i in 0..32 {
        let hi = hex_val(ph[2 + 2 * i]).ok_or(ErrorCode::BadContext)?;
        let lo = hex_val(ph[3 + 2 * i]).ok_or(ErrorCode::BadContext)?;
        provider_hash[i] = (hi << 4) | lo;
    }
    let extracted_from = find(ctx, b"\"extractedParameters\":{", 0).ok_or(ErrorCode::BadContext)?;
    Ok(ContextFields { context_address, provider_hash, extracted_from })
}

fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

pub fn extracted<'a>(ctx: &'a [u8], fields: &ContextFields, key: &str) -> Option<&'a [u8]> {
    string_field(ctx, key, fields.extracted_from)
}

/// "0.99899365" -> 998_993 (6 decimals, truncated). Digits, one optional dot, optional thousands commas.
pub fn parse_amount(s: &[u8]) -> Result<u64> {
    require!(!s.is_empty() && s.len() <= 40, ErrorCode::BadAmount);
    let mut int: u64 = 0;
    let mut frac: u64 = 0;
    let mut frac_digits = 0u32;
    let mut seen_dot = false;
    let mut any_digit = false;
    for &c in s {
        match c {
            b'0'..=b'9' => {
                any_digit = true;
                let d = (c - b'0') as u64;
                if seen_dot {
                    if frac_digits < AMOUNT_DECIMALS {
                        frac = frac * 10 + d;
                        frac_digits += 1;
                    }
                } else {
                    int = int.checked_mul(10).and_then(|x| x.checked_add(d)).ok_or(ErrorCode::BadAmount)?;
                }
            }
            b'.' if !seen_dot => seen_dot = true,
            b',' if !seen_dot => {}
            _ => return err!(ErrorCode::BadAmount),
        }
    }
    require!(any_digit, ErrorCode::BadAmount);
    let scale = 10u64.pow(AMOUNT_DECIMALS);
    let frac_scaled = frac * 10u64.pow(AMOUNT_DECIMALS - frac_digits);
    int.checked_mul(scale)
        .and_then(|x| x.checked_add(frac_scaled))
        .ok_or_else(|| error!(ErrorCode::BadAmount))
}

pub fn bucket(amount: u64) -> u8 {
    let unit = 10u64.pow(AMOUNT_DECIMALS);
    match amount / unit {
        0 => 0,
        1..=9 => 1,
        10..=99 => 2,
        100..=999 => 3,
        1_000..=9_999 => 4,
        _ => 5,
    }
}

pub fn asset_key(s: &[u8]) -> Result<[u8; ASSET_LEN]> {
    require!(!s.is_empty() && s.len() <= ASSET_LEN, ErrorCode::BadContext);
    require!(s.iter().all(|c| c.is_ascii_alphanumeric()), ErrorCode::BadContext);
    let mut k = [0u8; ASSET_LEN];
    k[..s.len()].copy_from_slice(s);
    Ok(k)
}

pub fn nullifier(exchange_id: &str, account_hash: &[u8], epoch: u32) -> [u8; 32] {
    keccak::hashv(&[b"counterledger:v1:", exchange_id.as_bytes(), b":", account_hash, b":", &epoch.to_le_bytes()])
        .to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amounts() {
        assert_eq!(parse_amount(b"0.99899365").unwrap(), 998_993);
        assert_eq!(parse_amount(b"12").unwrap(), 12_000_000);
        assert_eq!(parse_amount(b"1,234.5").unwrap(), 1_234_500_000);
        assert!(parse_amount(b"1.2.3").is_err());
        assert!(parse_amount(b"").is_err());
        assert!(parse_amount(b"-1").is_err());
    }

    #[test]
    fn buckets() {
        assert_eq!(bucket(998_993), 0);
        assert_eq!(bucket(5_000_000), 1);
        assert_eq!(bucket(10_000_000_000), 5);
    }

    #[test]
    fn context_parsing_ignores_escaped_keys() {
        let ctx = br#"{"contextAddress":"Abc","contextMessage":"{\"wallet_balance\":\"999\"}","extractedParameters":{"asset":"USDT","wallet_balance":"1.5"},"providerHash":"0x00000000000000000000000000000000000000000000000000000000000000ff"}"#;
        let f = context_fields(ctx).unwrap();
        assert_eq!(f.context_address, b"Abc");
        assert_eq!(f.provider_hash[31], 0xff);
        assert_eq!(extracted(ctx, &f, "wallet_balance").unwrap(), b"1.5");
        assert_eq!(extracted(ctx, &f, "asset").unwrap(), b"USDT");
    }
}
