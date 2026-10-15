#![allow(ambiguous_glob_reexports)]

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("D6a8LBt3wiGQGp1oEXnvUCJNTQoMJmSnFfTNJSRAKH9m");

#[program]
pub mod anti_social_network {
    use super::*;

    pub fn create_profile(
        ctx: Context<CreateProfile>,
        username: String,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::profile::create_profile(ctx, username, metadata_uri)
    }

    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        username: String,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::profile::update_profile(ctx, username, metadata_uri)
    }

    pub fn downvote(ctx: Context<CreateJudgment>, target: Pubkey) -> Result<()> {
        instructions::judgment::downvote(ctx, target)
    }

    pub fn boo(ctx: Context<CreateJudgment>, target: Pubkey) -> Result<()> {
        instructions::judgment::boo(ctx, target)
    }

    pub fn retract_judgment(ctx: Context<RetractJudgment>) -> Result<()> {
        instructions::judgment::retract_judgment(ctx)
    }
}
