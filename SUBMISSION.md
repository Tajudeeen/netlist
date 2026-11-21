# Submission answers — X Layer TapeOut Accelerate

Source-backed against the **official brief** at
`https://web3.okx.com/xlayer/build-x-series` (read 2026-11-20), summarized in
[`research/hackathon-intelligence.md`](research/hackathon-intelligence.md).
Everything below is a claim we can defend with a command or a live URL.

## One-line pitch

**Netlist — know what you're composing.** A pre-flight checker that walks a
TapeOut circuit's REF dependencies on chain, checks each circuit's claims
against its live netlist hash, and returns allow/deny with a reason code.

## What problem does it solve? Who needs it?

A developer composing TapeOut circuits today sees a circuit ID and its
`gateCount`. They cannot see what it references, whether its published claims
still match its bytes after a rewire, or whether a dependency deep in the
chain has gone stale. Composers — circuit authors, DeWEB builders, and
integrators assembling circuits into apps — either trust blindly or re-read
every netlist by hand.

**Evidence this is real:** TAPs issue [#50](https://github.com/TapeOutProtocol/TAPs/issues/50)
("Composable Circuit Interface") explicitly lists as an open question:
"how should clients detect stale or mismatched descriptions?" TAP-02 §7.3
recommends verifiers record the REF closure. Netlist implements that
recommendation as an enforced, on-chain check.

## Why existing tools fall short

The prior-art check ([`research/prior-art.md`](research/prior-art.md)) found:

- `circuitInfo().gateCount` already reports gate count; the mining UI shows
  `depth`. We do **not** claim these as new.
- TAP-16 / TAP-21 specify attested and proof-verified *reads* with block
  staleness — not "this circuit's bytes changed after its author described it."
- TapeAPI's `policy-circuit` gate is an off-chain spending policy bound by
  EIP-712, not a composition gate over a target circuit's dependency graph.

**Defensible wedge:** no prior art found combines (a) an on-chain bounded REF
walk, (b) policy applied to *every* circuit reached, and (c) attestation
staleness tied to each circuit's live netlist hash. That combination is what
we built. Honest label: an integration/productization novelty, not a new
cryptographic primitive.

## What did you build?

| Component | Role |
|---|---|
| `TapNetlist.sol` | Bounded on-chain TAP-02 decoder: gate count, depth, REF detection |
| `TapRefs.sol` | REF-target extractor (processor, circuit id) |
| `TapeOutV2Adapter.sol` | Real TAP-02/TAP-10 reads against live X Layer contracts |
| `CompositionRegistry.sol` | Versioned publisher + auditor attestations bound to netlist hash |
| `DependencyAnalyzer.sol` | Bounded on-chain REF walk; cycle/missing/limit detection |
| `CompositionGate.sol` | `statusReport`, `checkCall`, `checkCallWithDependencies`, reason codes |
| `dashboard/` | Multi-page live site: splash, explorer, how-it-works, gate status |

**40 tests pass** on a local EVM, including a differential check of the
Solidity decoder against an independent JS decoder on **9 real circuits
fetched from X Layer**, and an on-chain A→B→C propagation test.

## What is real and deployed?

- **Real:** the on-chain data reads, the decoder, the analyzers, and every
  number on the live site. Reproduce with `npm run verify:xlayer` and
  `npm run verify:refs`.
- **Live URL:** https://tajudeeen.github.io/netlist/
- **Real protocol addresses used (X Layer, 196):**
  - processor factory `0x1f09DAeFA827f02CBb40967cc91b259763760761`
  - circuit beacon `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C`
  - circuit implementation `0x977f217887E085D298Cb3819cDAD5A0ee35F29B2`
  - container opener `0x536adD8F30f03b69f6fbF29d425A816A0dC50106`
  - payments `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9`
  - sample circuit: processor `0x839bdD6fa7A66416A609A735e11DE5411B98574e`, circuit id `1`
- **Not deployed:** Netlist's own contracts. The official brief states
  "Interfaces and other components do not need to be deployed onchain", and
  "You may build using existing TapeOut processors, circuits and developer
  tools." The contracts are compiled, tested, and deployment-ready via
  `node scripts/deploy.js xlayerMainnet` once a funded key is supplied.
- **Not verified:** that TapeOut's execution path invokes a gate like ours.
  Netlist is an advisory pre-flight check a composing caller chooses to call.

## How can a judge verify the claim?

```bash
git clone https://github.com/Tajudeeen/netlist.git && cd netlist
npm install && npm test          # 40 passing, offline
npm run verify:xlayer            # live X Layer reads, 0 mismatches
npm run verify:refs              # REF closure matches circuitInfo
npm run demo                     # A→B→C stale propagation transcript
```

Or open https://tajudeeen.github.io/netlist/ and press **Load circuits** —
9 real circuits render with derived gate count, depth, REF status, holder, and
container state, cross-checked against each processor's own `circuitInfo()`.

## Target users and commercial model

**Users:** circuit composers (authors and integrators), DeWEB builders
assembling circuits into apps, and circuit marketplaces that need to show
whether a listed circuit's description still matches its bytes.

**Revenue:** publisher attestation writes carry a configurable fee in OKB
(`attestationFee` in `CompositionRegistry`), paid by the circuit holder, not
by callers. Lookups stay free to drive adoption. Auditor attestations are
free to encourage independent review. Planned paid tier: automated
dependency-tree alerts when a circuit you depend on changes.

## Demo video outline (recommended ≤ 3 min)

1. (0:00–0:25) Problem: a circuit ID tells you nothing about what it composes.
2. (0:25–0:55) Live explorer: load 9 real X Layer circuits; show derived
   facts matching `circuitInfo()` and a REF circuit flagged.
3. (0:55–1:50) `npm run demo`: A→B→C all pass; rewire C; A and B denied with
   `stale`; re-attest C; A passes again.
4. (1:50–2:20) `npm run verify:xlayer`: live evidence with block number.
5. (2:20–2:50) Users, OKB attestation fee, honest advisory-only boundary.

## Submission mechanics (from the official brief)

- Channel: Google Form `https://forms.gle/EoDNbxQ65dev1wFd9` (sign-in gated;
  exact field labels UNVERIFIED).
- Deadline: **2026-12-07 23:59 UTC** — published but explicitly *provisional*;
  re-check the event page before submitting.
- Circuit projects must submit processor contract address + circuit ID.
  Websites/apps/tools must provide an access link and explain which TapeOut
  ecosystem capabilities they use: our access link is above; we use TapeOut
  on-chain circuit data, TAP-02 netlist records, TAP-10 container/payment
  contracts, and TapeOut's 436+ live X Layer processors.
- Video ≤ 3 min is recommended, not mandatory, but appears in the judging
  criteria.
- Existing code is eligible with "substantial new development completed
  during the event" — all work here is in this repository's commit history.

## Explicitly unresolved

- Deadline finality, judging weights, exact form fields, organizer position
  on AI/open-source disclosure — see
  [`hackathon-intelligence.md` §12](research/hackathon-intelligence.md#12-ambiguities-needing-organizer-confirmation-via-s13-telegram).
  Ask in the official Telegram: https://t.me/+-7ouB60aYig2MmM1
