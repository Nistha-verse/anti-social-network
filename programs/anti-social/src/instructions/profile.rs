use anchor_lang::prelude::*;

use crate::{
    constants::{METADATA_URI_MAX, PROFILE_SEED, PROFILE_SIZE, USERNAME_MAX},
    errors::AntiSocialError,
    events::{ProfileCreated, ProfileUpdated},
    state::Profile,
};

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = PROFILE_SIZE,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, Profile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump = profile.bump,
        has_one = owner,
    )]
    pub profile: Account<'info, Profile>,
}

pub fn create_profile(
    ctx: Context<CreateProfile>,
    username: String,
    metadata_uri: String,
) -> Result<()> {
    validate_profile_strings(&username, &metadata_uri)?;

    let now = Clock::get()?.unix_timestamp;
    let profile = &mut ctx.accounts.profile;
    profile.owner = ctx.accounts.owner.key();
    profile.username = username.clone();
    profile.metadata_uri = metadata_uri;
    profile.judgment_count = 0;
    profile.created_at = now;
    profile.updated_at = now;
    profile.bump = ctx.bumps.profile;

    emit!(ProfileCreated {
        owner: profile.owner,
        username,
        timestamp: now,
    });
    Ok(())
}

pub fn update_profile(
    ctx: Context<UpdateProfile>,
    username: String,
    metadata_uri: String,
) -> Result<()> {
    validate_profile_strings(&username, &metadata_uri)?;

    let now = Clock::get()?.unix_timestamp;
    let profile = &mut ctx.accounts.profile;
    profile.username = username.clone();
    profile.metadata_uri = metadata_uri;
    profile.updated_at = now;

    emit!(ProfileUpdated {
        owner: profile.owner,
        username,
        timestamp: now,
    });
    Ok(())
}

fn validate_profile_strings(username: &str, metadata_uri: &str) -> Result<()> {
    let username_len = username.as_bytes().len();
    if username_len == 0 {
        return err!(AntiSocialError::UsernameEmpty);
    }
    if username_len > USERNAME_MAX {
        return err!(AntiSocialError::UsernameTooLong);
    }
    if metadata_uri.as_bytes().len() > METADATA_URI_MAX {
        return err!(AntiSocialError::MetadataUriTooLong);
    }
    Ok(())
}
