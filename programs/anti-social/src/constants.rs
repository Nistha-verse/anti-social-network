use anchor_lang::prelude::*;

#[constant]
pub const COUNTER_SEED: &[u8] = b"counter";

#[constant]
pub const HELLO_WORLD_LAMPORTS: u64 = 1;

#[constant]
pub const MAX_COUNT: u64 = 10;
pub const DOWNVOTE_PRICE: u64 = 1_000_000;
pub const BOO_PRICE: u64 = 10_000_000;
pub const USERNAME_MAX: usize = 32;
pub const METADATA_URI_MAX: usize = 100;

pub const PROFILE_SEED: &[u8] = b"profile";
pub const JUDGMENT_SEED: &[u8] = b"judgment";
pub const SPITE_POOL_SEED: &[u8] = b"spite_pool";

pub const PROFILE_SIZE: usize = 205;
pub const JUDGMENT_SIZE: usize = 108;
