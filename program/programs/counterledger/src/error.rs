use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the admin can do this")]
    NotAdmin,
    #[msg("Only the observer can post reports")]
    NotObserver,
    #[msg("Too many entries")]
    TooMany,
    #[msg("Text too long")]
    TooLong,
    #[msg("Claim buffer is malformed")]
    BadBuffer,
    #[msg("Claim buffer write is out of range")]
    BufferOutOfRange,
    #[msg("Expected exactly two signed claims (account id + balance)")]
    WrongClaimCount,
    #[msg("Claim signature does not recover to a trusted Reclaim attestor")]
    UntrustedAttestor,
    #[msg("Claim signature is malformed")]
    BadSignature,
    #[msg("Claim context is not valid for this proof")]
    BadContext,
    #[msg("Claim was made with a provider this exchange does not accept")]
    UnknownProvider,
    #[msg("Claim is bound to a different wallet")]
    WrongProver,
    #[msg("Claim is too old")]
    StaleClaim,
    #[msg("Claim timestamp is in the future")]
    FutureClaim,
    #[msg("The two claims belong to different epochs")]
    EpochMismatch,
    #[msg("Balance could not be read")]
    BadAmount,
    #[msg("Report is older than the one already posted")]
    StaleReport,
    #[msg("Value out of range")]
    OutOfRange,
    #[msg("No score has been posted for this exchange yet")]
    NoScore,
    #[msg("Cover is not sold while a halt signal is active")]
    HaltSignalActive,
    #[msg("Pool exposure cap reached")]
    ExposureCap,
    #[msg("Amount must be positive")]
    ZeroAmount,
    #[msg("Not enough free assets in the pool")]
    InsufficientFree,
    #[msg("A trigger is pending or final")]
    TriggerActive,
    #[msg("No trigger is open")]
    NoTrigger,
    #[msg("Heartbeat does not show a confirmed halt")]
    NoHalt,
    #[msg("Challenge window has not passed yet")]
    ChallengeWindow,
    #[msg("Challenge window is over")]
    ChallengeOver,
    #[msg("Cover was not active at the trigger time")]
    CoverNotActive,
    #[msg("Cover already settled")]
    CoverSettled,
    #[msg("Cover has not expired")]
    CoverLive,
    #[msg("Math overflow")]
    Overflow,
}
