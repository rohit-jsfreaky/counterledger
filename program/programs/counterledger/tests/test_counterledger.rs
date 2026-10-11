//! LiteSVM tests for the claim → test list in the PRD. Claims are built here with a TEST attestor key (never a real
//! user's proof), in exactly the format @reclaimprotocol/js-sdk produces.

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    counterledger::{claim, SignedClaimArgs},
    k256::ecdsa::SigningKey,
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    sha3::{Digest, Keccak256},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const NOW: i64 = 1_791_700_000;
const TOKEN_PROGRAM: Pubkey = anchor_spl::token::ID;

fn keccak(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = Keccak256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

fn eth_address(key: &SigningKey) -> [u8; 20] {
    let pt = key.verifying_key().to_encoded_point(false);
    let h = keccak(&[&pt.as_bytes()[1..]]);
    h[12..].try_into().unwrap()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

struct TestClaim {
    provider: String,
    parameters: String,
    context: String,
    signed: SignedClaimArgs,
}

/// Build + sign a claim the way Reclaim does: identifier = keccak(provider\nparameters\ncontext), personal-sign of
/// "0x<id>\n<owner>\n<ts>\n<epoch>".
fn make_claim(attestor: &SigningKey, prover: &Pubkey, provider_hash: &[u8; 32], extracted: &str, ts: u32) -> TestClaim {
    let provider = "http".to_string();
    let parameters = format!(r#"{{"method":"GET","url":"https://api.coindcx.com/x","paramValues":{{{}}}}}"#, extracted);
    let context = format!(
        r#"{{"contextAddress":"{}","contextMessage":"{{\"app\":\"counterledger\"}}","extractedParameters":{{{}}},"providerHash":"0x{}"}}"#,
        prover,
        extracted,
        hex(provider_hash)
    );
    let id = keccak(&[provider.as_bytes(), b"\n", parameters.as_bytes(), b"\n", context.as_bytes()]);
    let owner = "0x87f1e40c09cbd6c3f64a90a35e67afb01709ae51".to_string();
    let msg = format!("0x{}\n{}\n{}\n{}", hex(&id), owner, ts, 1);
    let prefixed = format!("\x19Ethereum Signed Message:\n{}{}", msg.len(), msg);
    let digest = keccak(&[prefixed.as_bytes()]);
    let (sig, recid) = attestor.sign_prehash_recoverable(&digest).unwrap();
    let mut signature = [0u8; 65];
    signature[..64].copy_from_slice(&sig.to_bytes());
    signature[64] = 27 + recid.to_byte();
    TestClaim { provider, parameters, context, signed: SignedClaimArgs { owner, timestamp_s: ts, epoch: 1, signature } }
}

fn buffer_bytes(claims: &[&TestClaim]) -> Vec<u8> {
    let mut out = (claims.len() as u32).to_le_bytes().to_vec();
    for c in claims {
        for s in [&c.provider, &c.parameters, &c.context] {
            out.extend_from_slice(&(s.len() as u32).to_le_bytes());
            out.extend_from_slice(s.as_bytes());
        }
    }
    out
}

struct Env {
    svm: LiteSVM,
    pid: Pubkey,
    admin: Keypair,
    observer: Keypair,
    attestor: SigningKey,
    config: Pubkey,
    exchange: Pubkey,
    mint: Pubkey,
    provider_hashes: [[u8; 32]; 2],
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash(); // a fresh blockhash per tx: a retried identical tx is not "AlreadyProcessed"
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &bh);
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err) + &e.meta.logs.join("\n"))
}

fn set_time(svm: &mut LiteSVM, t: i64) {
    let mut c: Clock = svm.get_sysvar();
    c.unix_timestamp = t;
    svm.set_sysvar(&c);
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).unwrap();
    T::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn token_balance(svm: &LiteSVM, key: &Pubkey) -> u64 {
    let acc = svm.get_account(key).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

fn ix(pid: Pubkey, data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction::new_with_bytes(pid, &data.data(), accounts.to_account_metas(None))
}

fn setup() -> Env {
    let pid = counterledger::id();
    let mut svm = LiteSVM::new();
    svm.add_program(pid, include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/counterledger.so"))).unwrap();
    set_time(&mut svm, NOW);
    let admin = Keypair::new();
    let observer = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
    svm.airdrop(&observer.pubkey(), 1_000_000_000).unwrap();
    let attestor = SigningKey::random(&mut k256::elliptic_curve::rand_core::OsRng);
    let mint = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();

    let config = Pubkey::find_program_address(&[counterledger::CONFIG_SEED], &pid).0;
    send(
        &mut svm,
        &[ix(
            pid,
            counterledger::instruction::Initialize {
                observer: observer.pubkey(),
                attestors: vec![eth_address(&attestor)],
                challenge_window_secs: 3600,
            },
            counterledger::accounts::Initialize {
                admin: admin.pubkey(),
                config,
                usdc_mint: mint,
                system_program: system_program::ID,
            },
        )],
        &admin,
        &[],
    )
    .unwrap();

    let provider_hashes = [[0xaa; 32], [0xbb; 32]];
    let exchange = Pubkey::find_program_address(&[counterledger::EXCHANGE_SEED, b"coindcx"], &pid).0;
    send(
        &mut svm,
        &[ix(
            pid,
            counterledger::instruction::AddExchange {
                id: "coindcx".into(),
                name: "CoinDCX".into(),
                provider_hashes: provider_hashes.to_vec(),
            },
            counterledger::accounts::AddExchange { admin: admin.pubkey(), config, exchange, system_program: system_program::ID },
        )],
        &admin,
        &[],
    )
    .unwrap();
    Env { svm, pid, admin, observer, attestor, config, exchange, mint, provider_hashes }
}

/// Upload claims to the buffer and call record_proof. Returns the record PDA.
fn record(env: &mut Env, prover: &Keypair, claims: [&TestClaim; 2], account_hash: &str) -> Result<Pubkey, String> {
    let pid = env.pid;
    let buffer = Pubkey::find_program_address(&[counterledger::BUFFER_SEED, prover.pubkey().as_ref()], &pid).0;
    let bytes = buffer_bytes(&claims);
    send(
        &mut env.svm,
        &[ix(
            pid,
            counterledger::instruction::OpenClaimBuffer { capacity: bytes.len() as u32 },
            counterledger::accounts::OpenClaimBuffer { prover: prover.pubkey(), buffer, system_program: system_program::ID },
        )],
        prover,
        &[],
    )?;
    for (i, chunk) in bytes.chunks(800).enumerate() {
        send(
            &mut env.svm,
            &[ix(
                pid,
                counterledger::instruction::WriteClaimBuffer { offset: (i * 800) as u32, bytes: chunk.to_vec() },
                counterledger::accounts::WriteClaimBuffer { prover: prover.pubkey(), buffer },
            )],
            prover,
            &[],
        )?;
    }
    let epoch = (claims[0].signed.timestamp_s as i64 / counterledger::EPOCH_SECS) as u32;
    let nullifier = claim::nullifier("coindcx", account_hash.as_bytes(), epoch);
    let proof_record =
        Pubkey::find_program_address(&[counterledger::PROOF_SEED, env.exchange.as_ref(), &nullifier], &pid).0;
    send(
        &mut env.svm,
        &[ix(
            pid,
            counterledger::instruction::RecordProof {
                nullifier,
                claims: vec![claims[0].signed.clone(), claims[1].signed.clone()],
            },
            counterledger::accounts::RecordProof {
                prover: prover.pubkey(),
                config: env.config,
                exchange: env.exchange,
                buffer,
                proof_record,
                system_program: system_program::ID,
            },
        )],
        prover,
        &[],
    )?;
    Ok(proof_record)
}

fn prover(env: &mut Env) -> Keypair {
    let k = Keypair::new();
    env.svm.airdrop(&k.pubkey(), 2_000_000_000).unwrap();
    k
}

fn pair(env: &Env, who: &Pubkey, acct: &str, balance: &str, ts: u32) -> (TestClaim, TestClaim) {
    let a = make_claim(&env.attestor, who, &env.provider_hashes[1], &format!(r#""account_id":"{}""#, acct), ts);
    let b = make_claim(
        &env.attestor,
        who,
        &env.provider_hashes[0],
        &format!(r#""asset":"USDT","wallet_balance":"{}""#, balance),
        ts,
    );
    (a, b)
}

// ------------------------------------------------------------------------------------------------------ proofs

#[test]
fn proof_is_recorded_and_floor_grows() {
    let mut env = setup();
    let p = prover(&mut env);
    let (a, b) = pair(&env, &p.pubkey(), "Cr0Ksr+hash1", "0.99899365", NOW as u32 - 60);
    let rec = record(&mut env, &p, [&a, &b], "Cr0Ksr+hash1").expect("record_proof");
    let r: counterledger::ProofRecord = read(&env.svm, &rec);
    assert_eq!(&r.asset[..4], b"USDT");
    assert_eq!(r.bucket, 0);
    let ex: counterledger::Exchange = read(&env.svm, &env.exchange);
    assert_eq!(ex.prover_count, 1);
    assert_eq!(ex.floors[0].amount, 998_993);
    assert_eq!(ex.floors[0].provers, 1);

    let q = prover(&mut env);
    let (a2, b2) = pair(&env, &q.pubkey(), "otherAccount", "12.5", NOW as u32 - 30);
    record(&mut env, &q, [&b2, &a2], "otherAccount").expect("second account, claims in either order");
    let ex: counterledger::Exchange = read(&env.svm, &env.exchange);
    assert_eq!(ex.floors[0].amount, 998_993 + 12_500_000);
    assert_eq!(ex.floors[0].provers, 2);
}

#[test]
fn same_account_twice_in_one_epoch_is_rejected() {
    let mut env = setup();
    let p = prover(&mut env);
    let (a, b) = pair(&env, &p.pubkey(), "sameAccount", "5", NOW as u32 - 60);
    record(&mut env, &p, [&a, &b], "sameAccount").unwrap();
    // the same exchange account, proven again from ANOTHER wallet: same nullifier → the record PDA already exists
    let q = prover(&mut env);
    let (a2, b2) = pair(&env, &q.pubkey(), "sameAccount", "500", NOW as u32 - 10);
    assert!(record(&mut env, &q, [&a2, &b2], "sameAccount").is_err());
    let ex: counterledger::Exchange = read(&env.svm, &env.exchange);
    assert_eq!(ex.floors[0].amount, 5_000_000, "floor unchanged by the duplicate");
}

#[test]
fn edited_balance_is_rejected() {
    let mut env = setup();
    let p = prover(&mut env);
    let (a, mut b) = pair(&env, &p.pubkey(), "acct", "1", NOW as u32 - 60);
    b.context = b.context.replace(r#""wallet_balance":"1""#, r#""wallet_balance":"1000000""#);
    let e = record(&mut env, &p, [&a, &b], "acct").unwrap_err();
    assert!(e.contains("UntrustedAttestor") || e.contains("0x1777"), "{e}");
}

#[test]
fn unknown_attestor_is_rejected() {
    let mut env = setup();
    let p = prover(&mut env);
    let rogue = SigningKey::random(&mut k256::elliptic_curve::rand_core::OsRng);
    let ts = NOW as u32 - 60;
    let a = make_claim(&rogue, &p.pubkey(), &env.provider_hashes[1], r#""account_id":"x""#, ts);
    let b = make_claim(&rogue, &p.pubkey(), &env.provider_hashes[0], r#""asset":"USDT","wallet_balance":"9""#, ts);
    assert!(record(&mut env, &p, [&a, &b], "x").unwrap_err().contains("UntrustedAttestor"));
}

#[test]
fn proof_from_other_provider_is_rejected() {
    let mut env = setup();
    let p = prover(&mut env);
    let ts = NOW as u32 - 60;
    let a = make_claim(&env.attestor, &p.pubkey(), &[0x11; 32], r#""account_id":"x""#, ts);
    let b = make_claim(&env.attestor, &p.pubkey(), &env.provider_hashes[0], r#""asset":"USDT","wallet_balance":"9""#, ts);
    assert!(record(&mut env, &p, [&a, &b], "x").unwrap_err().contains("UnknownProvider"));
}

#[test]
fn proof_bound_to_another_wallet_is_rejected() {
    let mut env = setup();
    let p = prover(&mut env);
    let thief = prover(&mut env);
    let (a, b) = pair(&env, &p.pubkey(), "acct", "3", NOW as u32 - 60);
    assert!(record(&mut env, &thief, [&a, &b], "acct").unwrap_err().contains("WrongProver"));
}

#[test]
fn stale_proof_is_rejected() {
    let mut env = setup();
    let p = prover(&mut env);
    let old = (NOW - counterledger::MAX_PROOF_AGE_SECS - 10) as u32;
    let (a, b) = pair(&env, &p.pubkey(), "acct", "3", old);
    assert!(record(&mut env, &p, [&a, &b], "acct").unwrap_err().contains("StaleClaim"));
}

// ----------------------------------------------------------------------------------------------------- reports

fn post(env: &mut Env, heartbeat: bool, value: u16, as_of: i64) -> Result<(), String> {
    let data_hb = counterledger::instruction::PostHeartbeat { value, as_of, evidence_hash: [7; 32] };
    let data_sc = counterledger::instruction::PostScore { value, as_of, evidence_hash: [8; 32] };
    let accounts = counterledger::accounts::PostReport {
        observer: env.observer.pubkey(),
        config: env.config,
        exchange: env.exchange,
    };
    let i = if heartbeat { ix(env.pid, data_hb, accounts) } else { ix(env.pid, data_sc, accounts) };
    let observer = env.observer.insecure_clone();
    send(&mut env.svm, &[i], &observer, &[])
}

#[test]
fn reports_need_the_observer_and_cannot_go_back_in_time() {
    let mut env = setup();
    post(&mut env, true, counterledger::HB_NORMAL, NOW - 100).unwrap();
    assert!(post(&mut env, true, counterledger::HB_NORMAL, NOW - 200).unwrap_err().contains("StaleReport"));
    assert!(post(&mut env, false, 101, NOW).unwrap_err().contains("OutOfRange"));
    // an outsider cannot post
    let outsider = prover(&mut env);
    let bad = ix(
        env.pid,
        counterledger::instruction::PostScore { value: 10, as_of: NOW, evidence_hash: [0; 32] },
        counterledger::accounts::PostReport { observer: outsider.pubkey(), config: env.config, exchange: env.exchange },
    );
    assert!(send(&mut env.svm, &[bad], &outsider, &[]).unwrap_err().contains("NotObserver"));
}

// ------------------------------------------------------------------------------------------------------- cover

struct Market {
    pool: Pubkey,
    vault: Pubkey,
    lp: Keypair,
    lp_token: Pubkey,
    buyer: Keypair,
    buyer_token: Pubkey,
}

fn market(env: &mut Env) -> Market {
    let pid = env.pid;
    let pool = Pubkey::find_program_address(&[counterledger::POOL_SEED, env.exchange.as_ref()], &pid).0;
    let vault = Pubkey::find_program_address(&[counterledger::VAULT_SEED, pool.as_ref()], &pid).0;
    let admin = env.admin.insecure_clone();
    send(
        &mut env.svm,
        &[ix(
            pid,
            counterledger::instruction::CreatePool { cap_bps: 5_000, base_rate_bps: 200 },
            counterledger::accounts::CreatePool {
                admin: admin.pubkey(),
                config: env.config,
                exchange: env.exchange,
                usdc_mint: env.mint,
                pool,
                vault,
                token_program: TOKEN_PROGRAM,
                system_program: system_program::ID,
            },
        )],
        &admin,
        &[],
    )
    .unwrap();
    let lp = prover(env);
    let buyer = prover(env);
    let lp_token = CreateAssociatedTokenAccount::new(&mut env.svm, &admin, &env.mint).owner(&lp.pubkey()).send().unwrap();
    let buyer_token =
        CreateAssociatedTokenAccount::new(&mut env.svm, &admin, &env.mint).owner(&buyer.pubkey()).send().unwrap();
    MintTo::new(&mut env.svm, &admin, &env.mint, &lp_token, 1_000_000_000).send().unwrap();
    MintTo::new(&mut env.svm, &admin, &env.mint, &buyer_token, 100_000_000).send().unwrap();
    Market { pool, vault, lp, lp_token, buyer, buyer_token }
}

fn deposit(env: &mut Env, m: &Market, amount: u64) -> Result<(), String> {
    let position = Pubkey::find_program_address(&[counterledger::LP_SEED, m.pool.as_ref(), m.lp.pubkey().as_ref()], &env.pid).0;
    let lp = m.lp.insecure_clone();
    send(
        &mut env.svm,
        &[ix(
            env.pid,
            counterledger::instruction::LpDeposit { amount },
            counterledger::accounts::LpDeposit {
                owner: lp.pubkey(),
                pool: m.pool,
                vault: m.vault,
                owner_token: m.lp_token,
                position,
                token_program: TOKEN_PROGRAM,
                system_program: system_program::ID,
            },
        )],
        &lp,
        &[],
    )
}

fn withdraw(env: &mut Env, m: &Market, shares: u64) -> Result<(), String> {
    let position = Pubkey::find_program_address(&[counterledger::LP_SEED, m.pool.as_ref(), m.lp.pubkey().as_ref()], &env.pid).0;
    let lp = m.lp.insecure_clone();
    send(
        &mut env.svm,
        &[ix(
            env.pid,
            counterledger::instruction::LpWithdraw { shares },
            counterledger::accounts::LpWithdraw {
                owner: lp.pubkey(),
                pool: m.pool,
                vault: m.vault,
                owner_token: m.lp_token,
                position,
                token_program: TOKEN_PROGRAM,
            },
        )],
        &lp,
        &[],
    )
}

fn buy(env: &mut Env, m: &Market, notional: u64, days: u16) -> Result<Pubkey, String> {
    let pool: counterledger::Pool = read(&env.svm, &m.pool);
    let index = pool.covers_sold;
    let cover =
        Pubkey::find_program_address(&[counterledger::COVER_SEED, m.pool.as_ref(), &index.to_le_bytes()], &env.pid).0;
    let buyer = m.buyer.insecure_clone();
    send(
        &mut env.svm,
        &[ix(
            env.pid,
            counterledger::instruction::BuyCover { notional, days, index },
            counterledger::accounts::BuyCover {
                owner: buyer.pubkey(),
                exchange: env.exchange,
                pool: m.pool,
                vault: m.vault,
                owner_token: m.buyer_token,
                cover,
                token_program: TOKEN_PROGRAM,
                system_program: system_program::ID,
            },
        )],
        &buyer,
        &[],
    )?;
    Ok(cover)
}

fn trigger(env: &mut Env, m: &Market, which: &str) -> Result<(), String> {
    let observer = env.observer.insecure_clone();
    let admin = env.admin.insecure_clone();
    match which {
        "open" => send(
            &mut env.svm,
            &[ix(
                env.pid,
                counterledger::instruction::OpenTrigger { evidence_hash: [9; 32] },
                counterledger::accounts::OpenTrigger {
                    observer: observer.pubkey(),
                    config: env.config,
                    exchange: env.exchange,
                    pool: m.pool,
                },
            )],
            &observer,
            &[],
        ),
        "cancel" => send(
            &mut env.svm,
            &[ix(
                env.pid,
                counterledger::instruction::CancelTrigger {},
                counterledger::accounts::CancelTrigger { admin: admin.pubkey(), config: env.config, pool: m.pool },
            )],
            &admin,
            &[],
        ),
        _ => send(
            &mut env.svm,
            &[ix(
                env.pid,
                counterledger::instruction::FinalizeTrigger {},
                counterledger::accounts::FinalizeTrigger { config: env.config, exchange: env.exchange, pool: m.pool },
            )],
            &admin,
            &[],
        ),
    }
}

fn claim_cover(env: &mut Env, m: &Market, cover: Pubkey) -> Result<(), String> {
    let buyer = m.buyer.insecure_clone();
    send(
        &mut env.svm,
        &[ix(
            env.pid,
            counterledger::instruction::ClaimCover {},
            counterledger::accounts::ClaimCover {
                owner: buyer.pubkey(),
                pool: m.pool,
                vault: m.vault,
                owner_token: m.buyer_token,
                cover,
                token_program: TOKEN_PROGRAM,
            },
        )],
        &buyer,
        &[],
    )
}

#[test]
fn cover_needs_a_score_and_is_priced_by_it() {
    let mut env = setup();
    let m = market(&mut env);
    deposit(&mut env, &m, 500_000_000).unwrap();
    assert!(buy(&mut env, &m, 10_000_000, 30).unwrap_err().contains("NoScore"));

    post(&mut env, false, 90, NOW).unwrap();
    let c1 = buy(&mut env, &m, 10_000_000, 30).unwrap();
    let cheap: counterledger::Cover = read(&env.svm, &c1);

    let mut env2 = setup();
    let m2 = market(&mut env2);
    deposit(&mut env2, &m2, 500_000_000).unwrap();
    post(&mut env2, false, 40, NOW).unwrap();
    let c2 = buy(&mut env2, &m2, 10_000_000, 30).unwrap();
    let dear: counterledger::Cover = read(&env2.svm, &c2);
    assert!(dear.premium > cheap.premium, "lower score → higher premium ({} vs {})", dear.premium, cheap.premium);
}

#[test]
fn cover_respects_the_exposure_cap_and_halt_signals() {
    let mut env = setup();
    let m = market(&mut env);
    deposit(&mut env, &m, 100_000_000).unwrap();
    post(&mut env, false, 80, NOW).unwrap();
    // cap 50% of 100 test-USDC → 60 is refused, 40 is fine
    assert!(buy(&mut env, &m, 60_000_000, 30).unwrap_err().contains("ExposureCap"));
    buy(&mut env, &m, 40_000_000, 30).unwrap();
    post(&mut env, true, counterledger::HB_BELOW_USUAL, NOW).unwrap();
    assert!(buy(&mut env, &m, 1_000_000, 30).unwrap_err().contains("HaltSignalActive"));
}

#[test]
fn halt_trigger_pays_after_the_challenge_window() {
    let mut env = setup();
    let m = market(&mut env);
    deposit(&mut env, &m, 500_000_000).unwrap();
    post(&mut env, false, 70, NOW).unwrap();
    let cover = buy(&mut env, &m, 50_000_000, 30).unwrap();
    let before = token_balance(&env.svm, &m.buyer_token);

    // no trigger without a confirmed halt
    assert!(trigger(&mut env, &m, "open").unwrap_err().contains("NoHalt"));
    post(&mut env, true, counterledger::HB_HALT_CONFIRMED, NOW + 10).unwrap();
    set_time(&mut env.svm, NOW + 20);
    trigger(&mut env, &m, "open").unwrap();
    // LPs cannot run while a trigger is pending; nothing pays before the window ends
    assert!(withdraw(&mut env, &m, 1_000_000).unwrap_err().contains("TriggerActive"));
    assert!(trigger(&mut env, &m, "finalize").unwrap_err().contains("ChallengeWindow"));
    assert!(claim_cover(&mut env, &m, cover).unwrap_err().contains("NoTrigger"));

    set_time(&mut env.svm, NOW + 20 + 3600);
    trigger(&mut env, &m, "finalize").unwrap();
    claim_cover(&mut env, &m, cover).unwrap();
    assert_eq!(token_balance(&env.svm, &m.buyer_token), before + 50_000_000);
    assert!(claim_cover(&mut env, &m, cover).unwrap_err().contains("CoverSettled"), "no double payout");
}

#[test]
fn a_wrong_trigger_can_be_cancelled_inside_the_window() {
    let mut env = setup();
    let m = market(&mut env);
    deposit(&mut env, &m, 500_000_000).unwrap();
    post(&mut env, true, counterledger::HB_HALT_CONFIRMED, NOW).unwrap();
    trigger(&mut env, &m, "open").unwrap();
    trigger(&mut env, &m, "cancel").unwrap();
    let pool: counterledger::Pool = read(&env.svm, &m.pool);
    assert_eq!(pool.trigger_opened_at, 0);
    withdraw(&mut env, &m, 1_000_000).expect("LP can withdraw again after a cancelled trigger");
}
