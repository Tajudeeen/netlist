# Prior art & competing-solutions check — circuit composability / netlist analysis / attestation in the TapeOut ecosystem

**Date of check:** 2026-11-20. **Method:** GitHub REST API (TapeOutProtocol account repos, TAPs PRs/issues, code/repo search), raw spec files from `raw.githubusercontent.com`, rendered `tapeout.net` + its JS bundle (`index-DizVcbig.js`, 1.57 MB), TapeAPI docs, and local inspection of `C:\Users\tajud\netlist\contracts`.

**Capability codes:** **GC** = gate counting · **D** = depth analysis · **REF** = REF dependency discovery · **A** = attestation / staleness · **CG** = composition gating (allow/deny on calling/composing a circuit).

**Labels:** **VERIFIED** = I read the actual source/page. **PLAUSIBLE** = supported by docs/partial signals but not directly confirmed. **UNVERIFIED** = could not confirm.

---

## Blunt bottom line

**This is not greenfield.** The protocol team has already specified, verified on mainnet, and in several cases deployed the *building blocks* Netlist uses:

- On-chain **gate counting** exists today as `circuitInfo().gateCount` (TAP-02 §6), including REF sub-circuits.
- **Depth** already exists as a first-class PoD mining metric (`depth` = "longest combinational path", plus `refDepth`/`refGates`/`refArea`) displayed in the official client and stored in a mining-registry struct.
- **REF closure** is already a documented well-formedness concept (acyclic REF graph) and TAP-02 §7 *explicitly recommends* that verifiers record the block, the REF closure, and the beacon implementation.
- **Attestation/staleness** is heavily specified at the *read* layer (TAP-16 attested reads with signed answers and disagreement→reject; TAP-21 proof-verified reads; TAP-10 `stale-block`), and in credentials (expiry/revocation).
- **Gating with a circuit** already exists as TapeAPI's experimental policy-circuit gate (netlist hash bound by EIP-712, `admit()` allow/deny).
- **Composability** is already an open idea (#50) that explicitly says TAP-02 provides native composition primitives and lists "how clients detect stale or mismatched descriptions" as an **open question**.

What is genuinely unsolved — and is Netlist's only defensible wedge — is the **combination**: an on-chain *recursive REF dependency walk that propagates a policy to every reached circuit*, with attestations whose staleness is tied to the **live netlist hash** of each circuit in the closure, and a **composition gate that turns derived facts + both attestation tracks + seal status into an allow/deny with reason codes**. No prior art found does that. It is a productization/assembly novelty, not a novel primitive — and note the protocol team has already scoped the problem in issue #50, so Netlist is ahead of the spec rather than filling an unknown gap.

`*` = no single prior artifact claims or implements this combination; found via targeted GitHub/web search (0 hits for "netlist analyzer solidity" and "circuit composition blockchain" repo searches). Absence of evidence here is moderate, not absolute → **PLAUSIBLE** for the combination's uniqueness.

---

## Findings table

| # | Artifact | What it does | Exact source URL | GC | D | REF | A | CG | Label |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **TAP-02 — Circuit Netlist Format and Evaluation Semantics** (Standards, Draft; merged) | Byte format (NAND/LATCH/REF), well-formedness, beat semantics, bit packing, read ABI. `circuitInfo()` returns `(nIn,nOut,nState,gateCount)`; gateCount counts all NAND+LATCH incl. REF. §3: total gate count ≤ 2^32−1 incl. REF, REF graph acyclic. §7.1: tools MUST bound gates and **REF depth**; §7.3: verifiers SHOULD record block, **REF closure**, beacon implementation. Notes a 16-level REF limit for critical-path depth in PoD mining. | https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-02.md | YES (on-chain) | PARTIAL (depth bounded/mentioned, no exposed depth API) | YES (concept + well-formedness) | PARTIAL (record block/closure/beacon; not enforced) | YES at tapeout only (target must exist, pin-match, be registered CPU) | VERIFIED |
| 2 | **TAP-02 reference implementation** (`reference.py`, MIT) | ~140-line decoder/encoder/well-formedness/one-beat evaluator. `load()` follows REF via `resolve`, accumulates `n_gates`/`n_state` recursively. No depth computation, no attestation, no gating. | https://github.com/TapeOutProtocol/TAPs/blob/main/assets/tap-02/reference.py | YES (off-chain) | NO | YES (recursive load) | NO | NO | VERIFIED |
| 3 | **tapeout.net official client + PoD mining** | SPA. Canvas = drag NAND gates, real-time simulation, tape out. Circuit stats show `gateCount`, `nState`, `depth`. Mining task struct on chain: `circuitId, taskId, gateCount, stateCount, depth, area, mult, since, status, registrant`; UI labels `depth` = "d = longest combinational path" and shows `refGates`/`refDepth`/`refArea`/`refCost` for reference circuits. No dependency viewer, no attestation, no composition gate. | https://tapeout.net ; bundle: https://tapeout.net/app/assets/index-DizVcbig.js | YES | YES | PARTIAL (refDepth/refGates metrics only) | NO | NO | VERIFIED |
| 4 | **TapeKit** (TapeOutProtocol) | Open-source DeWEB browser kernel: reads chain directly, verifies each byte's SHA-256 against two independent nodes, opens sites by `4246.0.tape` name / circuit #ID / container address. Spec CC0, code MIT. No circuit analysis code in tree (`kernel/src/`: abi, cache, config, identity, keccak, name, path, purity, rpc, selectors, sha). | https://github.com/TapeOutProtocol/TapeKit | NO | NO | NO | NO (transport-level hash checks only) | NO | VERIFIED |
| 5 | **TapeOutProtocol/list** | Fork of the Public Suffix List. Unrelated. | https://github.com/TapeOutProtocol/list | NO | NO | NO | NO | NO | VERIFIED |
| 6 | **TAP-16 — Attested Reads from Independent Container Services** (merged Draft) | Signed `eth_call` results at an explicit pinned block from ≥2 independent services; any disagreement rejects (no majority/quorum); contradiction records anyone can verify. Explicitly warns it is not sufficient for high-value decisions. This is the protocol's real "attestation" primitive — but for service reads, not circuit composition. | https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-16.md | NO | NO | NO | YES (block pin, signed answers, disagreement→reject) | NO | VERIFIED |
| 7 | **TAP-21 — Proof-Verified Reads** (merged Draft) | Proof-verified reads at a pinned block with `stale-block` check; adopts proofs at block of reads. | https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-21.md | NO | NO | NO | YES | NO | VERIFIED |
| 8 | **TAP-10 — DeWEB** (merged Draft) | Node agreement rules, pinned blocks, `stale-block` freshness check, containers. The staleness concept Netlist reuses at a different layer. | https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-10.md | NO | NO | NO | YES (read freshness) | NO | VERIFIED |
| 9 | **TapeAPI policy-circuit gate** (experimental `@tapeapi/policy-circuit` 0.1.0; **unmerged** TAPs PR #84) | A `tapnet/1` NAND/LATCH netlist (≤49,152 B, 128 in / 8 out) is a *spending rule*; EIP-712 `PolicyBinding(netlistHash, subject, tablesHash, notBefore, expires, issued)` binds it; `createPolicyGate().admit()` returns allow/deny with reason code; revocations; stateful policies via latches. Docs explicitly: **off-chain**, binds only parties that check it, not a signing guardrail, nothing deployed, outside compatibility promise. | https://github.com/BruceLanLan/tapeapi/blob/main/docs/guides/policy-circuit.md ; PR: https://github.com/TapeOutProtocol/TAPs/pull/84 | NO | NO | NO (NAND/LATCH policy; no REF walk) | PARTIAL (signed binding + expiry + revocation; staleness is time-based, not "circuit changed") | YES (but spending policy, not circuit composition) | VERIFIED |
| 10 | **TAPs issue #50 — Composable Circuit Interface** (open **idea**, no implementing draft PR) | Proposes Interface / Circuit Reference / Connection metadata for connecting reusable circuits. States TAP-02 already provides native composition primitives. Open question #5: "Where should metadata live, and how should clients detect **stale or mismatched** descriptions?" Open question #6: which connections can be lowered into REF construction. | https://github.com/TapeOutProtocol/TAPs/issues/50 | NO | NO | PARTIAL (describes port compatibility, not REF discovery) | NO (identifies the problem, unbuilt) | NO (proposed metadata validation only) | VERIFIED (issue exists and says this); NOT IMPLEMENTED |
| 11 | **Netlist-Bound NFT family** — TAPs PRs #67/#69/#70/#75/#76 (all open drafts); repo `BruceLanLan/TAP-721` | #67 netlist-bound NFT identity by netlist hash; #69 PoD attribute snapshots (carries mining `gateCount`/`depth`/`area`/`mult` facts at pinned block, with functional check "so verified on chain is never shown as correct"); #70 structural hash of flat netlists (renumber/instruction-swap invariant); #75 signed design credits/lineage; #76 soulbound credentials with "proven / attested (EIP-712 issuer, expiry, revocation) / claimed" tiers. | https://github.com/TapeOutProtocol/TAPs/pull/67 ; /pull/69 ; /pull/70 ; /pull/75 ; /pull/76 ; https://github.com/BruceLanLan/TAP-721 | PARTIAL (#69 snapshot) | PARTIAL (#69 snapshot) | NO | PARTIAL (credential attestation w/ expiry/revocation; not live-netlist staleness) | NO | VERIFIED |
| 12 | **TAP-draft: Official Curated Circuit Collections (OCCC)** (open PR #103; deployed on BSC/X Layer/Base) | Standards draft for curated circuit collections; registry `0x0a3e…88e7`, vault impl `0x7eE2…6bAeD`, reference implementation + 50 fork tests. A circuit *registry*, not an analyzer/auditor. | https://github.com/TapeOutProtocol/TAPs/pull/103 | NO | NO | NO | NO | NO | VERIFIED |
| 13 | **TAP-draft: Large Netlists and Verifiable Execution** (open PR #74) | `tapnet/2` (NAND/LATCH + mask-ROM/RAM ports, REF-free), chunked `netlistHash2`, one-step segment/beat verifiers, dispute rules for off-chain execution of large netlists. Relevant to verifiable *execution*, not composition gating; explicitly no REF. | https://github.com/TapeOutProtocol/TAPs/pull/74 | NO | NO | NO | PARTIAL (commitments + dispute) | NO | VERIFIED |
| 14 | **NetLayerLabs/Cerebr** | Neural processor on X Layer built on TapeOut; compiles neurons into NAND netlists. A circuit *compiler*, not an analyzer/auditor. | https://github.com/NetLayerLabs/Cerebr | NO | NO | NO | NO | NO | VERIFIED (existence/description from GitHub search); PLAUSIBLE on internals |
| 15 | **General web3 / ZK circuit tooling** (Circom/snarkjs, ZoKrates, halo2; EDA: Yosys/ABC; contract verifiers: Certora/Halmos/Echidna) | Different domains: proof-system circuit compilers or smart-contract/RTL verification. No on-chain TapeOut-style REF dependency + attestation staleness + composition gate found. Targeted repo searches: "netlist analyzer solidity" → 0 results; "circuit composition blockchain" → 0 results. | n/a (no single source URL; negative-result searches above) | NO* | NO* | NO* | NO* | NO* | UNVERIFIED (no direct hit found; not an exhaustive survey) |

`*` = none found in the checked tooling; label UNVERIFIED because general tooling was not exhaustively surveyed.

---

## Differentiation assessment — what remains genuinely unsolved

### Already solved by the protocol → NOT a novelty claim for Netlist

1. **Gate counting.** `circuitInfo().gateCount` already returns it on chain, REF-inclusive (TAP-02 §6), and the mining UI shows it. Re-deriving it on chain from decoded netlist bytes is **redundant unless the adapter portability argument is the point**. Claim it as "verified derivation," not "new capability."
2. **Depth.** Already a first-class mining metric (`depth`, `refDepth`, "longest combinational path"). "We compute depth" is **not** differentiation.
3. **REF dependency discovery as a concept.** TAP-02 §3 already states the REF graph is acyclic and §7.3 already recommends recording the REF closure. Netlist *productizes* an existing recommendation.
4. **Attestation/staleness in the abstract.** TAP-16/10/21 are mature staleness specs; credential drafts add EIP-712 attestation + expiry/revocation. "We have attestations with timestamps" is not new.
5. **"Gate" semantics.** TapeAPI's policy-circuit already has an allow/deny gate driven by a hashed netlist and EIP-712 binding (off-chain).

### Genuinely unsolved → Netlist's defensible wedge (do not overclaim beyond this)

1. **On-chain recursive REF dependency walking *with policy propagation*.** `DependencyAnalyzer._walk()` + `CompositionGate.checkCallWithDependencies()` walk REF targets on chain (cycle/missing/limit detection) and apply the policy to every reached circuit. TAP-02 §7.3 says verifiers "SHOULD record" the closure; no protocol tool walks it on chain and enforces a policy at each node. Evidence: local contracts + README. **Label: VERIFIED (implemented locally), PLAUSIBLE (unique vs. ecosystem).**
2. **Attestation staleness bound to the live netlist hash of each circuit.** `CompositionRegistry._withStaleness()` compares `adapter.netlistHash(processor,id)` against `circuitNetlistHash` captured at attestation, with versioned dual tracks (publisher/auditor) and holder re-check via `ownerOf`. TAP-16/21 staleness is about *block/pinned reads*; credential drafts use *time expiry/revocation*. Neither ties an attestation to "the underlying circuit's bytes changed." **Label: VERIFIED (implemented), PLAUSIBLE (novel combination).**
3. **A composition gate over *target circuit facts*.** `statusReport()` / `checkCall()` / `requireCallAllowed()` combine derived cost/depth, publisher+auditor attestations, seal status and container activation into allow/deny with machine-readable reason codes. Closest prior art (policy-circuit gate) gates *spending* by re-running a policy netlist; TAP-02 gating is tapeout-time structural well-formedness. Nothing found gates *calling/composing a circuit* on the target's cost/depth/dependency/attestation freshness. **Label: PLAUSIBLE (strongest novelty claim; no direct hit found).**
4. **Off-chain dashboard reading live circuits.** Explorers are common (tapeout.net itself); the derived-facts view is a UX differentiator, not a technical first. **Label: PLAUSIBLE.**

### Honest limits (do not inflate)

- Netlist's own contracts are **not deployed** on X Layer (no private key in repo), and protocol-enforced composition checks are **not in place** — advisory only. Per README: https://github.com/Tajudeeen/netlist (found via GitHub search, `Tajudeeen/netlist`).
- Issue #50 shows the protocol team **already identified** "detect stale or mismatched descriptions" as an open question. Netlist is early relative to the spec, but the problem is not unknown to them — expect this to be absorbed if a composability TAP is written.
- TAP-02 §7.3 already recommends exactly the facts Netlist exposes (block, REF closure, beacon version); the differentiation is *enforcement + UX + on-chain policy propagation*, not the facts themselves.
- Policy-circuit gate shows a precedent for "netlist hash + signed binding + gate"; if that draft advances, reviewers may view Netlist's gate as an application of an established pattern rather than a new primitive.

---

## Sources (all URLs checked 2026-11-20)

1. TapeOutProtocol account (User; 3 repos) — https://github.com/TapeOutProtocol ; API: https://api.github.com/users/TapeOutProtocol/repos
2. TAPs index — https://github.com/TapeOutProtocol/TAPs/blob/main/README.md
3. TAP-02 — https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-02.md
4. TAP-02 reference.py — https://github.com/TapeOutProtocol/TAPs/blob/main/assets/tap-02/reference.py
5. TAP-10 — https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-10.md
6. TAP-16 — https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-16.md
7. TAP-21 — https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-21.md
8. TapeKit — https://github.com/TapeOutProtocol/TapeKit
9. tapeout.net — https://tapeout.net ; JS bundle https://tapeout.net/app/assets/index-DizVcbig.js
10. TapeAPI policy-circuit guide — https://github.com/BruceLanLan/tapeapi/blob/main/docs/guides/policy-circuit.md
11. TAPs PR #84 (Policy Circuit Gate) — https://github.com/TapeOutProtocol/TAPs/pull/84
12. TAPs issue #50 (Composable Circuit Interface) — https://github.com/TapeOutProtocol/TAPs/issues/50
13. TAPs PRs #67/#69/#70/#74/#75/#76/#103 — https://github.com/TapeOutProtocol/TAPs/pulls
14. TAP-721 — https://github.com/BruceLanLan/TAP-721
15. Cerebr — https://github.com/NetLayerLabs/Cerebr
16. Netlist (own repo) — https://github.com/Tajudeeen/netlist
17. Local contracts inspected: `C:\Users\tajud\netlist\contracts\{DependencyAnalyzer,CompositionGate,CompositionRegistry}.sol`
