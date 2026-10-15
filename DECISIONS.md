# Decisions

## 2026-10-15 — Anchor client/toolchain

The installed toolchain is `anchor-cli 1.2.0`, `solana-cli 3.1.10`, Rust `1.98.1`, and Node `v24.10.0`. The workspace uses Anchor Rust `1.2.0` and `@anchor-lang/core` `1.2.0`, matching the installed Anchor CLI template rather than upgrading the toolchain.

`anchor test --validator legacy` was attempted. With the installed Solana 3.1.10 legacy validator, deployment failed while parsing the generated eBPF ELF (`invalid file header`). The default Anchor 1.2.0 Surfpool-backed `anchor test` succeeds, so the reproducible project test command is `npm test` / `anchor test`. This is an environment/toolchain compatibility limitation, not an application behavior change.

## 2026-10-15 — Program layout

The generated scaffold's program directory was renamed to `programs/anti-social/src` and the test file to `tests/anti-social.ts` to match the requested repository layout. The crate/package and program ID remain `anti_social_network` / `D6a8LBt3wiGQGp1oEXnvUCJNTQoMJmSnFfTNJSRAKH9m` so the generated IDL and existing keypair stay stable.

## 2026-10-15 — Transaction payer in integration tests

The test helper builds and signs transactions with the actor as fee payer. This makes the measured actor debit include the exact program price, judgment-account rent, and one 5,000-lamport network signature fee, matching the program's real wallet flow. The frontend will likewise submit transactions from the connected wallet.
