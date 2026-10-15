# Project status

## Phase 1 — Program and tests: complete

- `anchor build`: passed.
- `npm test` (`anchor test` with the installed Anchor 1.2.0 default local Surfpool validator): passed, **14 passing**.
- Covered: profile create/update validation, Boo, Downvote, ordered IDs, first pool deposit, exact prices and actor debit, retraction without refund/closure, spoofing, unauthorized and duplicate retraction, self-judgment, missing profile, stale PDA, wrong profile, underfunding rollback, fake pool, exact account sizes, and raw byte offsets.
- Account layout assertions passed: Profile `205` bytes and Judgment `108` bytes.

The legacy Solana validator path was attempted and is blocked by the installed Anchor/Solana toolchain combination; see `DECISIONS.md`. The project test command uses the working default local validator path.

## Phase 2 — Devnet deployment and measurements: complete

- Program ID: `D6a8LBt3wiGQGp1oEXnvUCJNTQoMJmSnFfTNJSRAKH9m` (declared and keypair-synchronized).
- Devnet deployment: complete. `solana program show` reported ProgramData `A8oFxqcH9zN3vGn3kVkXi4wSxRuSuP7fx3KL9SzYzM2p`, last deployed slot `511356237`, data length `173528`, balance `0.88240108 SOL`, and the original authority unchanged.
- `npm run measure:cu` completed against real devnet with `https://devnet.rpcpool.com` after the Solana Labs endpoint rate-limited. It recorded `create_profile 8966`, `update_profile 4929`, `downvote 22880`, `boo 18380`, and `retract_judgment 4449` compute units in the README with Explorer links.

## Phase 3 — Frontend core flows: implementation complete, interactive wallet gate pending

- Implemented the Vite + React app, generated frontend IDL copy, RPC data layer, PDA derivation, byte-offset receipt reads, wallet-adapter Wallet Standard setup, devnet genesis guard, polling fallback, event subscriptions, real transaction flows, cost confirmation, error mapping, and profile/Discover/Pool screens.
- `cd app && npm run build`: passed.
- The deployed app has been rendered and smoke-checked in headless Chromium against Vercel. Interactive Windows wallet approval is still a manual owner step before claiming create-profile/Boo/Downvote/Retract browser acceptance.
- Production smoke check: `https://app-nu-rose-23.vercel.app/`, `/pool`, and `/me` each returned HTTP 200; headless Chromium rendered the Discover screen with the wallet selector and Spite Pool.

## Phase 4 — Character, receipt, jar, and responsive polish: implementation complete, visual gate pending

- Implemented deterministic SVG characters, protocol moods, receipt cards, raw-byte verification panel, retraction stamp, animated bounded jar, exact SOL labels, responsive CSS down to 380px, focus states, and reduced-motion styles.
- Desktop and 380px responsive styling is implemented; manual owner visual review remains recommended.

## Phase 5 — Documentation and self-review: in progress

- README has actual deployment and measurement values, architecture, account offsets, security properties, limits, demo steps, and real program/judgment links.
- Live app: `https://app-nu-rose-23.vercel.app/` (Vercel production deployment `dpl_7TxLNog71dxFzRKX3LszRiWKBZyw`). Dockerfile build passed (`docker build -t anti-social-network:local .`) and serves the production frontend on port 4173. GitHub remote `https://github.com/Nistha-verse/anti-social-network.git` is configured and the multi-commit `master` history is pushed.
