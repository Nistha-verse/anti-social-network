use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub owner: Pubkey,
    #[max_len(32)]
    pub username: String,
    #[max_len(100)]
    pub metadata_uri: String,
    pub judgment_count: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JudgmentKind {
    Downvote,
    Boo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JudgmentStatus {
    Active,
    Retracted,
}

#[account]
#[derive(InitSpace)]
pub struct Judgment {
    pub id: u64,
    pub actor: Pubkey,
    pub target: Pubkey,
    pub kind: JudgmentKind,
    pub amount: u64,
    pub status: JudgmentStatus,
    pub created_at: i64,
    pub retracted_at: Option<i64>,
    pub bump: u8,
}
