use anchor_lang::prelude::*;

#[error_code]
pub enum AntiSocialError {
    #[msg("Username cannot be empty")]
    UsernameEmpty,
    #[msg("Username must be at most 32 UTF-8 bytes")]
    UsernameTooLong,
    #[msg("Metadata URI must be at most 100 UTF-8 bytes")]
    MetadataUriTooLong,
    #[msg("You cannot judge yourself")]
    SelfJudgmentNotAllowed,
    #[msg("Only the judgment actor can retract this judgment")]
    UnauthorizedRetraction,
    #[msg("This judgment has already been retracted")]
    JudgmentAlreadyRetracted,
    #[msg("Numeric value overflowed")]
    MathOverflow,
}
