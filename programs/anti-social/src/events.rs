use anchor_lang::prelude::*;

#[event]
pub struct ProfileCreated {
    pub owner: Pubkey,
    pub username: String,
    pub timestamp: i64,
}

#[event]
pub struct ProfileUpdated {
    pub owner: Pubkey,
    pub username: String,
    pub timestamp: i64,
}

#[event]
pub struct Downvoted {
    pub actor: Pubkey,
    pub target: Pubkey,
    pub judgment: Pubkey,
    pub id: u64,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct Booed {
    pub actor: Pubkey,
    pub target: Pubkey,
    pub judgment: Pubkey,
    pub id: u64,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct JudgmentRetracted {
    pub actor: Pubkey,
    pub target: Pubkey,
    pub judgment: Pubkey,
    pub id: u64,
    pub timestamp: i64,
}
