# Netlist source-code and protocol audit

Date: 2026-11-24  
Repository reviewed: https://github.com/Tajudeeen/netlist  
Base reviewed: `main`  
Scope: static source review and comparative research. This is not a formal security audit. No code was changed as part of this report, and the repository test suite was not executed during this review.

## Executive assessment

Netlist has a credible product direction: inspect TapeOut circuits, derive their actual REF dependency closure, evaluate attestation freshness and processor trust, and explain whether a circuit is safe to compose under a policy.

The combination is differentiated from the public projects reviewed. The surrounding ecosystem already contains circuit-governed wallets, vaults, policy registries, frozen evaluators and circuit analytics explorers. Netlist must therefore prove that its recursive composition analysis and transitive attestation checks work correctly.

The current implementation is not ready to make strong security claims. The highest-priority work is protocol conformance, attestation binding and reproducible chain verification. More dashboard features should wait.

## Research method

Reviewed primary sources and source code rather than relying on project descriptions:

- TAP-02 netlist specification, reference Python implementation and official test vectors.
- TAP-10 node agreement, pinned-block and implementation-trust requirements.
- TAP-21 processor/beacon deployment evidence.
- Netlist's `TapNetlist.sol`, `TapRefs.sol`, `DependencyAnalyzer.sol`, `TapeOutV2Adapter.sol`, `CompositionRegistry.sol`, `CompositionGate.sol`, JavaScript decoder, REF resolver and live verification scripts.
- Relevant source files and test/documentation material from Nandout, Fusebox, TapeAPI, TapeSafe, Stego, TapeScope, TapeGate, LeoLabs Agent Firewall, OpenGate and RuleChip.

This review distinguishes specification requirements, source-code observations, live-chain claims and unverified assumptions.

## Closest reference implementations

| Project / developer | What it actually builds | What Netlist should learn |
|---|---|---|
| [Nandout](https://github.com/davieslennox0/nandout) | Circuit-governed decision layer, frozen netlist snapshots, ownerless evaluator, processor implementation pinning, exhaustive policy verification | Immutable evaluation boundary, processor-upgrade handling, explicit circuit hash checks and deep test coverage |
| [Fusebox](https://github.com/0xdopewilly/fusebox) | Circuit-governed agent wallet with an ordered fuse stack, bounded calls, strict status codes, processor trust registry and decision receipts | Fail-closed integration, gas/return-data limits, processor codehash and implementation allowlists, observable decision records |
| [TapeAPI](https://github.com/BruceLanLan/tapeapi) | Signed policy-circuit bindings, revocation and policy checks | Re-check binding and revocation state at decision time |
| [TapeSafe](https://github.com/kin684660-commits/TapeSafe) | Approval rules represented by a real deployed TapeOut circuit and an execution module | Circuit output must be checked inside the contract path that protects the action |
| [Stego](https://github.com/kvzuobai/stego) | Circuit-governed vault policies with exhaustive input proofs, monotonicity checks, timelocked activation and slashing | Property-based and exhaustive verification, immutable policy envelopes, explicit failure behavior |
| [TapeScope](https://github.com/Tiannuryadins/tapescope) | Read-only X Layer analytics terminal, processor discovery, circuit lookup, snapshot/live verification | Clear snapshot versus live labels and broad protocol discovery; do not copy its unpinned single-RPC indexer assumptions |
| [TapeGate](https://github.com/melatim80186/tape-gate-xlayer) | On-chain circuit-gated treasury spending | Derive decision inputs inside the enforcing contract and make the actual execution path honor the circuit |
| [LeoLabs Agent Firewall](https://github.com/runesleo/leolabs-agent-firewall) | Pre-sign transaction firewall with deterministic checks and TapeOut circuit provenance | Strict ABI decoding, reason codes, reproducible receipts |
| [OpenGate](https://github.com/KAMEVETRICS/opengate) | Circuit-governed vault rules with timelocked changes | Bounded evaluation and safe policy-change lifecycle |
| [RuleChip](https://github.com/lichao01111-dot/rulechip) | Composable game-rule circuits, exhaustive truth-table checks and live on-chain evaluation | Explicit circuit interfaces and end-to-end verification |

These projects are adjacent references, not exact duplicates. The public source review did not identify a one-to-one implementation combining recursive REF closure analysis, publisher/auditor attestations, processor trust and transitive composition policy. That is a bounded research finding, not a claim that no private or undiscovered implementation exists.

## P0 findings: correctness and security

### 1. TAP-02 decoder is incomplete

Files:
- `contracts/libraries/TapNetlist.sol`
- `test/decoder.js`

Observed gaps:

- The LATCH `d` index is checked against a broad maximum, but not against the final signal count `S`.
- The decoder does not receive `nOut`, so it cannot verify that enough element-produced signals exist for the outputs.
- REF records are parsed, but the analyzer does not compare their declared input/output pin counts with the target circuit's `circuitInfo`.
- The Solidity and JavaScript decoders share the same incorrect depth assumptions, so agreement between them is not an independent correctness proof.
- The signal limit is set to `0x00ffffff`, while TAP-02 specifies `S <= 2^24`. The implementation is one value stricter than the specification.

Required change:

Port the normative TAP-02 validation rules and use the official `assets/tap-02/vectors.json` plus `assets/tap-02/reference.py` as independent test oracles. Preserve malformed-record and missing-target failure behavior.

### 2. Depth semantics are wrong for LATCH and REF

File: `contracts/libraries/TapNetlist.sol`

Current behavior:
- LATCH output is assigned `max(parentDepth, 0) + 1`.
- REF is treated as one additional level without recursively computing the referenced circuit's depth.

TAP-02 evaluation semantics say a LATCH output is the previous beat's state and does not depend on current-beat inputs. The protocol's depth implementation treats LATCH output depth as zero, tracks the D-input path as a timing endpoint, and recursively adds referenced circuit depth through REF.

Required change:

Implement protocol-compatible depth analysis with:
- LATCH output depth reset to zero.
- LATCH D-input path included as a separate critical-path endpoint.
- REF depth recursively calculated from its input path and referenced circuit depth.
- Memoization keyed by (processor, circuitId).
- Explicit hard bounds for REF depth and memo capacity.
- Separate fields for local depth and expanded REF-aware depth if both are useful.

Use the official implementation semantics as the reference, not the current JS decoder.

### 3. Gate count is local where the product needs expanded count

Files:
- `contracts/adapters/TapeOutV2Adapter.sol`
- `contracts/CompositionGate.sol`
- `scripts/ref-closure.js`

The adapter's `gateCount()` returns `TapNetlist.Analysis.gateCount`, which counts only top-level NAND and LATCH records. TAP-02 defines `circuitInfo().gateCount` as including gates reached through REF.

The current gas estimate therefore undercounts REF circuits.

The off-chain REF resolver has a separate problem: it globally deduplicates circuit identities before summing gate counts. TAP-02's recursive `circuitInfo` adds the referenced circuit's gate count for each REF record. Reusing the same subcircuit twice creates two evaluation instances and must contribute twice to expanded evaluation cost.

Required change:

Expose distinct measurements:
- `localGateCount`: NAND + LATCH records in this netlist.
- `uniqueCircuitCount`: unique circuit identities in the dependency closure.
- `expandedInstanceCount`: number of circuit instances after following each REF occurrence.
- `expandedGateCount`: recursive gate count including each REF occurrence.

Use the protocol-reported `circuitInfo.gateCount` as a live cross-check. Do not label a unique-node sum as the protocol's expanded gate count.

### 4. Dependency limit is checked against publisher declaration

File: `contracts/CompositionGate.sol`

`checkCall()` checks `maxDepsCount` against `declaredDepsCount` from the publisher attestation. `checkCallWithDependencies()` discovers the actual REF closure but does not enforce the policy's dependency ceiling against that discovered result.

Required change:

Define whether the policy ceiling means unique dependency identities or expanded REF instances. Enforce the chosen metric against the analyzer's result. Keep publisher-declared dependency metadata informational until it has been reconciled with the discovered closure.

### 5. Publisher attestation survives ownership transfer

File: `contracts/CompositionRegistry.sol`

The publisher attestation records the publisher address, but `_withStaleness()` only compares the current netlist hash with the stored netlist hash. It does not compare the stored attestor with the circuit's current `ownerOf`.

The source comment says a prior holder's attestation does not carry forward, but the read path does not enforce that claim.

Required change:

Mark publisher attestation stale or invalid when the current circuit holder differs from the recorded publisher. Add a transfer regression test. Define auditor-attestation lifecycle separately, since auditor identity is not the circuit holder.

### 6. Declared dependency hash is stored but not reconciled

File: `contracts/CompositionRegistry.sol`

`depsListHash` and `declaredDepsCount` are stored, but the composition gate does not compare them against the discovered REF closure.

Required change:

Define a canonical encoding and ordering for the actual dependency identity set. Compute its hash and compare it with the publisher declaration. Expose a machine-readable mismatch reason and the actual dependency list in the report.

### 7. Attestations do not bind processor implementation identity

File: `contracts/CompositionRegistry.sol`

Attestations bind the netlist hash, but not the implementation that interprets the netlist. TAP-02 warns that a circuit's meaning depends on referenced circuits and the processor implementation behind the beacon while the factory remains upgradeable.

Required change:

Capture and compare the reviewed processor implementation identity/code hash as part of attestation freshness. A processor implementation change must invalidate or suspend the attestation until re-reviewed. Do not rely on netlist hash alone.

## P1 findings: verification quality

### 8. Live verification reads are not block-pinned or independently corroborated

Files:
- `scripts/verify-xlayer.js`
- `scripts/verify-ref.js`

Both scripts print a block number but perform their calls using `latest`. They use one RPC endpoint by default.

TAP-10 requires reads for one verification operation to use one pinned block and describes agreement across independent RPC operators. The current scripts explicitly acknowledge that one RPC is not a quorum.

Required change:

- Obtain a pinned block using the TAP-10 procedure.
- Pin all `eth_call`, `eth_getCode`, `eth_getStorageAt` and related reads to that block.
- Compare at least two independent RPC operators.
- Reject disagreements rather than silently choosing a majority.
- Record block number, block hash, chain ID, processor proxy, beacon, implementation, implementation code hash, circuit ID, netlist hash and REF closure in the report.

### 9. Current live verification is too narrow

`verify-xlayer.js` samples up to nine circuits and skips the gate-count comparison for REF circuits. It does not compare live `eval`/`step` outputs against the independent reference implementation.

`verify-ref.js` checks one REF example and one plain example. It does not exercise repeated REF targets, diamond graphs or a broad multi-hop set.

Required change:

- Port official TAP-02 valid and ill-formed vectors.
- Add local tests for repeated REF targets, shared dependencies, nested REF, LATCH-in-REF, missing target, bad arity, forward signal and malformed records.
- Compare on-chain `eval`/`step` with the independent evaluator for representative X Layer circuits.
- Keep constructed vectors, local mocks and live-chain evidence clearly separated.

### 10. Hard resource limits need to be protocol-aware

File: `contracts/DependencyAnalyzer.sol`

The caller controls `maxDepth` and `maxCircuits`. The analyzer allocates `new CircuitRef[](maxCircuits)` before enforcing any global ceiling.

Required change:

Introduce measured protocol-level maximums for depth, unique identities, expanded instances and total work. Reject unreasonable caller values before allocating. Do not choose the limits without gas measurements and representative REF graphs.

## P1 findings: deployment and trust assumptions

- The Netlist verification script states that the Netlist CompositionGate contracts are not deployed on X Layer. The live adapter checks TapeOut state; it does not prove that Netlist itself is deployed or enforcing calls.
- The current default policy requires a sealed processor. The adapter's own comments say X Layer is unsealed and its beacon ownership evidence does not satisfy the seal condition. A default-policy rejection is therefore expected on current X Layer state.
- TAP-02's verified source comparison is for BNB Smart Chain. The document explicitly says the X Layer implementation had not yet been compared with the reference source at the time of that revision.
- TAP-10 describes the contracts as unsealed and says no independent audit had been published at the time of its review.

Required product behavior:

Display these as explicit trust states. Never show a green "verified" label based only on a matching implementation address or a successful single-RPC read.

## Product differentiation

Netlist should focus on the gap the adjacent products do not fill:

1. Parse the real TAP-02 netlist.
2. Resolve every REF edge into a reproducible dependency graph.
3. Distinguish unique circuit identities from expanded evaluation instances.
4. Verify publisher and auditor attestations against live ownership, netlist hash and processor implementation.
5. Propagate policy checks through the actual dependency closure.
6. Produce an explainable report with evidence at a pinned block.

The explorer should show:
- root circuit and its netlist hash;
- direct REF edges and full transitive closure;
- unique dependencies and expanded instance count;
- local and expanded gate counts;
- local and REF-aware depth;
- missing, malformed, cyclic or truncated status;
- publisher/auditor attestation status;
- current holder and implementation trust;
- block number/hash and RPC agreement evidence.

A "composition allowed" result must state the exact policy and evidence snapshot it evaluated.

## Recommended regression test matrix

| Area | Required test |
|---|---|
| TAP-02 validation | Reject truncated record |
| TAP-02 validation | Reject insufficient output signals |
| TAP-02 validation | Reject LATCH D index at or beyond final S |
| TAP-02 validation | Reject REF arity mismatch |
| TAP-02 validation | Reject REF target not registered |
| Depth | LATCH output depth is zero |
| Depth | LATCH D-input path is included |
| Depth | REF depth includes referenced circuit depth |
| REF graph | A → B → C returns two REF levels |
| REF graph | Diamond A → B,C → D reports four unique circuits |
| REF graph | Repeated REF to D increases expanded instance/gate count |
| REF graph | Missing target fails closed |
| REF graph | Cycle fails closed |
| Policy | Actual dependency limit is enforced |
| Attestation | Transfer invalidates publisher attestation |
| Attestation | Netlist change invalidates attestation |
| Attestation | Processor implementation change invalidates attestation |
| Attestation | Declared dependency hash mismatch is surfaced |
| RPC | All reads use the same pinned block |
| RPC | Independent RPC disagreement rejects the report |
| Live chain | On-chain eval/step agrees with independent TAP-02 evaluator |

## Source references

- [TAP-02 specification](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-02.md)
- [TAP-02 reference implementation](https://github.com/TapeOutProtocol/TAPs/blob/main/assets/tap-02/reference.py)
- [TAP-02 official vectors](https://github.com/TapeOutProtocol/TAPs/blob/main/assets/tap-02/vectors.json)
- [TAP-10 node agreement and pinned block](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-10.md)
- [TAP-21 deployment evidence](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-21.md)
- [Nandout NetlistVM](https://github.com/davieslennox0/nandout/blob/main/contracts/src/vendor/tapeout/lib/NetlistVM.sol)
- [Nandout LatchEvaluator](https://github.com/davieslennox0/nandout/blob/main/contracts/src/LatchEvaluator.sol)
- [Nandout LatchGate](https://github.com/davieslennox0/nandout/blob/main/contracts/src/LatchGate.sol)
- [Nandout PolicyRegistry](https://github.com/davieslennox0/nandout/blob/main/contracts/src/PolicyRegistry.sol)
- [Fusebox Wallet](https://github.com/0xdopewilly/fusebox/blob/main/contracts/src/FuseboxWallet.sol)
- [Fusebox Registry](https://github.com/0xdopewilly/fusebox/blob/main/contracts/src/FuseRegistry.sol)
- [TapeAPI](https://github.com/BruceLanLan/tapeapi)
- [TapeSafe](https://github.com/kin684660-commits/TapeSafe)
- [Stego PolicyRegistry](https://github.com/kvzuobai/stego/blob/main/contracts/src/PolicyRegistry.sol)
- [TapeScope](https://github.com/Tiannuryadins/tapescope)
- [TapeGate](https://github.com/melatim80186/tape-gate-xlayer)
- [LeoLabs Agent Firewall](https://github.com/runesleo/leolabs-agent-firewall)
- [OpenGate](https://github.com/KAMEVETRICS/opengate)
- [RuleChip](https://github.com/lichao01111-dot/rulechip)

## Next implementation order

1. Fix TAP-02 parser and depth semantics against the official vectors.
2. Fix dependency graph metrics and hard bounds.
3. Fix publisher ownership, implementation binding and dependency-hash reconciliation.
4. Upgrade live verification to pinned-block, independent-RPC evidence.
5. Add the recursive explorer and a reference consumer integration.

Do not expand UI scope until milestones 1–3 pass their regression tests.


## Remediation update — 2026-11-24

The first implementation pass is on branch `fix/protocol-correctness-and-trust-2026-11-24` and draft PR #1. It is not merged.

### Implemented on the branch

- TAP-02 structural decoder now receives both `nIn` and `nOut`, checks pin bounds, output signal availability, record lengths, NAND/REF backward references, final LATCH D bounds and the 2^24 signal ceiling.
- LATCH outputs use previous-beat state depth zero. Local depth includes the D-input path after forward signals are available. REF internals are not fabricated as one level.
- Official TAP-02 valid and ill-formed vectors are included as a CC0 fixture and exercised by tests. The two REF cases that require external resolution are deliberately excluded from structural-only invalid assertions.
- Publisher attestations are invalidated by netlist changes, current-holder changes and processor trust-identity changes.
- The real TapeOut adapter exposes circuitInfo and trustIdentity. The processor identity binds the factory proxy code, beacon address, current beacon implementation, beacon owner, seal state and pinned implementation.
- DependencyAnalyzer deduplicates unique circuit identities, counts every REF occurrence separately, enforces explicit depth/circuit/instance ceilings, and derives a canonical hash of unique direct REF targets.
- CompositionGate refuses to enforce a dependency ceiling from publisher-declared metadata alone. The dependency-aware path checks the actual unique closure and compares the canonical direct-dependency count/hash with the publisher declaration.
- REF target pin arity is checked when the configured reader exposes circuitInfo. The production deployment now wires the analyzer to TapeOutV2Adapter, which exposes netlist, circuitExists and circuitInfo. The test-only MockNetlistReader is no longer wired by the deployment script.
- ProcessorAdapterRegistry supports a default adapter, so every factory-recognized TapeOut processor can be read through the same adapter while still allowing processor-specific overrides.
- Off-chain REF closure now distinguishes unique circuit identities from expanded instances and recursively checks expanded gate/state totals, REF arity and configured resource ceilings.
- Live verification scripts require two independent RPC URLs, pin all reads to one block and compare block hashes and results.
- GitHub Actions CI was added. The dependency installation issue caused by an incorrectly non-optional bundled macOS fsevents lock entry was fixed.

### Verification evidence

- One GitHub Actions run completed with 53 passing tests after the decoder, analyzer, registry, gate and first REF closure changes.
- A later run is required for the newest commits, including processor identity binding, direct dependency commitments, live-reader wiring and the latest new regression tests.
- The deployment and live RPC verification scripts have not been run against X Layer from this branch.
- No contracts have been deployed or changed on mainnet as part of this work.

### Remaining work before merge

1. Get a fresh CI run green on the latest branch head.
2. Make REF target arity and structural validation mandatory for production configuration, not an optional reader capability. The deploy script now supplies the real adapter, but the analyzer retains a compatibility fallback for the older test reader.
3. Add on-chain expanded gate/state accounting or explicitly prevent gas ceilings from being applied to REF circuits when only local gate counts are available.
4. Benchmark the 32-depth, 128-unique-circuit and 512-expanded-instance ceilings against representative circuits and transaction gas limits. These are defensive caps, not yet benchmark-derived guarantees.
5. Verify all reads at one block across two independent RPC operators against X Layer and compare the deployed X Layer implementation with the normative TAP-02 reference. The specification's source comparison remains BNB-specific.
6. Test the full dependency-aware gate path for a correct direct-dependency commitment, a mismatched declaration, shared diamond dependencies and a stale transitive attestation.
7. Review the final PR diff and deployment script before merge.

Do not describe the current branch as production-audited or mainnet-verified.


### Additional remediation

- The production analyzer reader is now the real `TapeOutV2Adapter`, not the test-only mock. It exposes `circuitInfo`; the analyzer validates the root netlist and compares every REF target's declared input/output arity when this production reader is configured.
- The deployment registers TapeOutV2Adapter as the registry's default adapter. Processor-specific overrides remain possible, and the adapter itself checks factory registration before reading a processor.
- A canonical direct dependency commitment is now derived from sorted, unique direct REF targets. The dependency-aware gate compares it with the publisher's declared count and hash.
- Gas policy now fails closed for REF circuits and adapters that cannot prove their gate count is complete. The local gate count is not treated as an expanded gas bound. A non-REF circuit can still be checked against the configured estimate.
- The CI run on the branch before these latest gas-policy changes completed with 59 passing tests. A fresh run is in progress for the current head.
