use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::{BOO_PRICE, DOWNVOTE_PRICE, JUDGMENT_SEED, JUDGMENT_SIZE, PROFILE_SEED, SPITE_POOL_SEED},
    errors::AntiSocialError,
    events::{Booed, Downvoted, JudgmentRetracted},
    state::{Judgment, JudgmentKind, JudgmentStatus, Profile},
};

#[derive(Accounts)]
pub struct CreateJudgment<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        mut,
        seeds = [PROFILE_SEED, actor.key().as_ref()],
        bump = actor_profile.bump,
    )]
    pub actor_profile: Account<'info, Profile>,
    #[account(
        init,
        payer = actor,
        space = JUDGMENT_SIZE,
        seeds = [JUDGMENT_SEED, actor.key().as_ref(), actor_profile.judgment_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub judgment: Account<'info, Judgment>,
    #[account(mut, seeds = [SPITE_POOL_SEED], bump)]
    pub spite_pool: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RetractJudgment<'info> {
    pub actor: Signer<'info>,
    #[account(
        mut,
        seeds = [JUDGMENT_SEED, judgment.actor.as_ref(), judgment.id.to_le_bytes().as_ref()],
        bump = judgment.bump,
        has_one = actor @ AntiSocialError::UnauthorizedRetraction,
    )]
    pub judgment: Account<'info, Judgment>,
}

pub fn downvote(ctx: Context<CreateJudgment>, target: Pubkey) -> Result<()> {
    create_judgment(ctx, target, JudgmentKind::Downvote)
}

pub fn boo(ctx: Context<CreateJudgment>, target: Pubkey) -> Result<()> {
    create_judgment(ctx, target, JudgmentKind::Boo)
}

pub fn retract_judgment(ctx: Context<RetractJudgment>) -> Result<()> {
    let judgment = &mut ctx.accounts.judgment;
    require!(
        judgment.status == JudgmentStatus::Active,
        AntiSocialError::JudgmentAlreadyRetracted
    );

    let now = Clock::get()?.unix_timestamp;
    judgment.status = JudgmentStatus::Retracted;
    judgment.retracted_at = Some(now);

    emit!(JudgmentRetracted {
        actor: judgment.actor,
        target: judgment.target,
        judgment: judgment.key(),
        id: judgment.id,
        timestamp: now,
    });
    Ok(())
}

fn create_judgment(
    ctx: Context<CreateJudgment>,
    target: Pubkey,
    kind: JudgmentKind,
) -> Result<()> {
    require_keys_neq!(ctx.accounts.actor.key(), target, AntiSocialError::SelfJudgmentNotAllowed);

    let amount = match kind {
        JudgmentKind::Downvote => DOWNVOTE_PRICE,
        JudgmentKind::Boo => BOO_PRICE,
    };
    let now = Clock::get()?.unix_timestamp;
    let id = ctx.accounts.actor_profile.judgment_count;
    let judgment = &mut ctx.accounts.judgment;
    judgment.id = id;
    judgment.actor = ctx.accounts.actor.key();
    judgment.target = target;
    judgment.kind = kind;
    judgment.amount = amount;
    judgment.status = JudgmentStatus::Active;
    judgment.created_at = now;
    judgment.retracted_at = None;
    judgment.bump = ctx.bumps.judgment;

    ctx.accounts.actor_profile.judgment_count = id
        .checked_add(1)
        .ok_or(AntiSocialError::MathOverflow)?;

    let transfer_accounts = system_program::Transfer {
        from: ctx.accounts.actor.to_account_info(),
        to: ctx.accounts.spite_pool.to_account_info(),
    };
    system_program::transfer(
        CpiContext::new(ctx.accounts.system_program.key(), transfer_accounts),
        amount,
    )?;

    match kind {
        JudgmentKind::Downvote => emit!(Downvoted {
            actor: judgment.actor,
            target,
            judgment: judgment.key(),
            id,
            amount,
            timestamp: now,
        }),
        JudgmentKind::Boo => emit!(Booed {
            actor: judgment.actor,
            target,
            judgment: judgment.key(),
            id,
            amount,
            timestamp: now,
        }),
    }
    Ok(())
}
