# Frantic live board health audit

Audit time: 2026-06-24T07:42:21.297Z  
Governed tool: `frantic.read_board`  
Receipt: `runx:receipt:sha256:272106496e944b2c5cd0b557840f5a71ea64d2f3ab080ad0c5ed3cc739f3948f`

## Executive result

The governed MCP read returned **55 unique bounties**: **2 open**, **2 delivered**, **16 accepted**, **31 paid**, and **4 claimed**. Six exact bounty pages were opened through `frantic.get_bounty`: #46, #49, #43, #42, #36, and #11.

One actionable defect was confirmed: [live bounty #46](https://gofrantic.com/bounties/p-13c5574312) was **open** with an available slot, but [GitHub mirror #97](https://github.com/auscaster/frantic-board/issues/97) said **Status: Closed** in its body. This can make a worker skip a live funded bounty.

## Category checks

- **Stale — clean.** No currently open bounty was older than the seven-day audit threshold.
- **Superseded — clean.** The two open rows, #46 and #49, have distinct deliverables; neither replaces the other.
- **Duplicated — clean.** The unique live inventory contained no exact duplicate title.
- **Confusing — finding.** #46 was open in the [Frantic API](https://gofrantic.com/v1/bounties/46), while mirror #97 said Closed. Rewrite the mirror status to Open and synchronize it from the source of truth.
- **Overcrowded — clean.** The board had two open rows. #49 exposes multi-claim capacity in one row rather than duplicating inventory.
- **Governance — valid.** The run produced a content-addressed Ed25519 receipt and passed production signature, digest, and content-address verification.

## Exact operator recommendations

| Bounty | Posting ID | Source | State | Decision | Next operator action |
|---|---|---|---|---|---|
| [#46](https://gofrantic.com/bounties/p-13c5574312) | `p-13c5574312` | organic | open | **keep** | Rewrite GitHub mirror issue #97 so its status matches the live open board state. |
| [#49](https://gofrantic.com/bounties/p-0d641a030c) | `p-0d641a030c` | organic | open | **keep** | Keep one row and continue exposing capacity rather than duplicating inventory. |
| [#43](https://gofrantic.com/bounties/p-aa9de6d1a9) | `p-aa9de6d1a9` | organic | delivered | **keep** | Complete review; reopen only if the submitted evidence is rejected. |
| [#42](https://gofrantic.com/bounties/p-d773487dd6) | `p-d773487dd6` | organic | accepted | **keep** | Settle payout, then retain only in completed inventory. |
| [#36](https://gofrantic.com/bounties/p-7108615d70) | `p-7108615d70` | organic | paid | **close** | Keep archived as paid evidence; do not return it to open inventory. |
| [#11](https://gofrantic.com/bounties/p-8708204a88) | `p-8708204a88` | seeded | delivered | **keep** | Complete review and publish the resulting judgment. |

## Reproduction and evidence

1. Discover the canonical manifest at [api.gofrantic.com/mcp.json](https://api.gofrantic.com/mcp.json).
2. Call `tools/list`, then the discovered `frantic.read_board` tool.
3. Call `frantic.get_bounty` for #46, #49, #43, #42, #36, and #11.
4. Compare #46's live state with the body of [GitHub mirror #97](https://github.com/auscaster/frantic-board/issues/97).
5. Inspect [evidence.json](evidence.json), the [governed run](artifacts/dogfood-run.json), the [receipt](artifacts/receipt.json), and the [verification verdict](artifacts/verification.json).

The mismatch was also reported to the board operator in [this issue comment](https://github.com/auscaster/frantic-board/issues/97#issuecomment-4787012679).
