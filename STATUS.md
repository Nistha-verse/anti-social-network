# Project status

## Phase 1 — Program and tests: complete

- `anchor build`: passed.
- `npm test` (`anchor test` with the installed Anchor 1.2.0 default local Surfpool validator): passed, **14 passing**.
- Covered: profile create/update validation, Boo, Downvote, ordered IDs, first pool deposit, exact prices and actor debit, retraction without refund/closure, spoofing, unauthorized and duplicate retraction, self-judgment, missing profile, stale PDA, wrong profile, underfunding rollback, fake pool, exact account sizes, and raw byte offsets.
- Account layout assertions passed: Profile `205` bytes and Judgment `108` bytes.

The legacy Solana validator path was attempted and is blocked by the installed Anchor/Solana toolchain combination; see `DECISIONS.md`. The project test command uses the working default local validator path.

## Phase 2 — Devnet deployment and measurements: pending

- Program ID: `D6a8LBt3wiGQGp1oEXnvUCJNTQoMJmSnFfTNJSRAKH9m` (declared and keypair-synchronized).
- Devnet deployment: TODO.
- Compute-unit measurements: TODO.

## Phase 3 — Frontend core flows: pending

Not started.

## Phase 4 — Character, receipt, jar, and responsive polish: pending

Not started.

## Phase 5 — Documentation and self-review: pending

Not started. No frontend URL or real judgment verification link exists yet.
