# Problem inventory and concept score — evidence-led

Date 2026-11-20. Labels: VERIFIED (read at source) / PLAUSIBLE (supported by
partial signals) / UNVERIFIED. Sources are the official brief
[`hackathon-intelligence.md`](hackathon-intelligence.md), the prior-art scan
[`prior-art.md`](prior-art.md), TAP specs, and live chain reads.

## Problem inventory (composition risk in TapeOut)

| ID | Problem | Affected user | Evidence | Strength | Current workaround | Unresolved gap | Build opportunity |
|---|---|---|---|---|---|---|---|
| PRB-01 | A circuit's published description can go stale after its netlist changes; clients cannot tell. | Composer choosing a circuit | TAPs issue #50: "how should clients detect stale or mismatched descriptions?" VERIFIED | High | Re-read netlist manually | No automatic hash-bound invalidation of claims | Attestation tied to live netlist hash |
| PRB-02 | REF dependencies are invisible from a circuit ID; a 31-byte REF can expand into an arbitrarily large sub-circuit. | Composer, auditor | TAP-02 §2/§3/§7: REF format, acyclic graph, "tools MUST bound REF depth"; §7.3 verifiers SHOULD record REF closure. VERIFIED | High | Manual decode | No on-chain walker that enforces policy at each node | Bounded on-chain REF walk |
| PRB-03 | Depth and gate count are not exposed uniformly; gateCount includes REF, depth is a mining metric. | Tool builders | TAP-02 §6 `circuitInfo`, tapeout.net UI shows `depth`/`refDepth`. VERIFIED | High | Read `circuitInfo`, mining UI | Depth not in processor read ABI | On-chain decoder deriving both |
| PRB-04 | Processor seal is not binary; an upgrade can bypass a client's trust decision. | Integrator, DeWEB user | TAP-10 §13.8: seal needs factory seal + implementation pin + beacon owner. VERIFIED | High | Read `isSealed()` | Live X Layer `beacon.owner()==0x0` contradicts spec; no tool surfaces all three claims | Separate seal evidence fields |
| PRB-05 | One RPC operator can lie or be unavailable; TAP-10 default nodes belong to two operators, one running the sequencer. | Any reader | TAP-10 §5.2 / Security Considerations. VERIFIED | High | Trust a single endpoint | No quorum in a standalone tool | Honest disclosure; TAP-16/21 as future upgrade |
| PRB-06 | Composition gating is advisory unless the real execution path calls it. | Protocol integrator | TAPs issue #50 is an open idea; no composition TAP implemented. VERIFIED absence | Medium | None | Nothing forces a call to a gate | `checkCall` + `requireCallAllowed`, honestly labelled advisory |
| PRB-07 | Attestation primitives exist for *reads* and *time expiry*, not for "the circuit's bytes changed". | Circuit author, auditor | TAP-16/21 block-pinned reads; credential drafts #75/#76 expiry/revocation. VERIFIED | High | Time-bound credentials | No netlist-hash-bound attestation | Dual-track publisher/auditor registry |
| PRB-08 | A spike in processor count (436 → 438 in one session) outpaces any static list of "known circuits". | Marketplace, indexer | Live `cpuCount()` reads 2026-11-20: 0x1b4 then 0x1b6. VERIFIED | Medium | Hardcoded lists | No live discovery path | RPC-first dashboard, no cached fixtures |

## Concept score — Netlist (evidence-led, not a vanity score)

| Criterion | Weight | Score | Justification |
|---|---|---|---|
| Problem evidence and importance | 20 | 17 | PRB-01/02/04 are primary-source backed (TAP-02 issue #50, TAP-10). "Stale descriptions" is an explicit open question. Not 20 because no user interview confirms willingness to pay. |
| Hackathon track fit | 20 | 18 | Official brief explicitly encourages "developer tools" and "building on existing ecosystem tools"; mandatory TapeOut on-chain data satisfied with 9 real circuits. Not 20 because no named track and no published category weights. |
| Originality and differentiation | 15 | 10 | The *combination* (on-chain REF walk + per-node policy + hash-bound dual attestation) has no found prior art. Not 15 because gate counting, depth, and attestation primitives individually already exist. |
| Technical feasibility | 15 | 14 | Built and green: 24 contracts, 40 tests, live verifiers. Remaining deploy needs a funded key but official brief says deployment of interfaces is not required. |
| Engineering depth | 10 | 9 | Bounded graph walk with cycle/missing/limit detection, differential decoder test on live bytes, real ABI reverse-verified from chain. |
| Demo and verification potential | 10 | 9 | A→B→C stale propagation transcript + live explorer + three reproducible commands. Not 10 because the gate itself is not on chain. |
| Lasting usefulness | 10 | 7 | Plausible for composers/marketplaces; contingent on TapeOut adoption and on whether the team ships a composability TAP (issue #50) that absorbs this. |
| **Total** | **100** | **84** | Strong but not top-of-rubric: novelty is assembly, not primitive; no paying-user evidence; advisory boundary unresolved at protocol level. |

## Riskiest assumptions and cheap tests

1. **Assumption:** Judges reward tool/infrastructure entries over apps.
   *Test:* the brief lists "developer tools" as an eligible direction but gives
   no weights — ask in the official Telegram; do not assume a ranking.
2. **Assumption:** Using existing on-chain data (no deployed Netlist contract)
   satisfies "must use TapeOut circuits, contracts or onchain data on X Layer".
   *Test:* verified textual match in the official FAQ; already satisfied.
3. **Assumption:** The on-chain REF walk is genuinely novel.
   *Test:* prior-art scan of all TAP specs, TapeKit, tapeout.net and TapeAPI
   found no equivalent — PLAUSIBLE, not proven; re-check PR #84 and issue #50
   weekly.
4. **Assumption:** Deadline is Dec 7 23:59 UTC.
   *Test:* official page calls it *provisional* twice — re-check before submit.
5. **Assumption:** AI-assisted code is acceptable.
   *Test:* no restriction on the brief, but Terms §10 penalizes "fabricated
   functionality or data" — ask the organizer; keep the commit history and
   evidence trail intact either way.

## Decision

Proceed with the current scope. Do **not** spend remaining time on a second
explorer redesign or on adding features whose value depends on a deployed
gate. Highest-value remaining actions, in order: (1) record the ≤3 min demo
video from `SUBMISSION.md`, (2) confirm the ambiguities via Telegram, (3) if a
funded key appears, deploy and run `verify:deployed` — optional per the brief,
not a blocker.
