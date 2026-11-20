# Netlist

A composability gate for TapeOut circuits on X Layer. Built for X Layer
TapeOut Accelerate.

Composing someone else's circuit today means trusting it blind: no visibility
into gas cost, dependency depth, or whether the processor it lives on is even
sealed. Netlist fixes that with three layers of fact, kept deliberately
separate instead of collapsed into one "is this safe" boolean.

## Architecture

**Layer 1, Derived (trustless).** Gate count, circuit depth, and an estimated
gas cost, read live from the processor contract through a swappable adapter
(see "Verifiability" below). Computed from the real netlist, not self-reported.
This is possible at all because TapeOut circuits are literal on-chain
netlists, not opaque bytecode, that's the whole reason a tool like this can
exist here.

**Layer 2, Declared (attested, two separate tracks).**
- *Publisher attestation*: the circuit's current holder (enforced via the
  adapter's `ownerOf`) declares intended behavior, dependency count, and a
  self-declared risk tier.
- *Auditor attestation*: an independently authorized address (owner-managed
  allowlist in this build) can separately attest its own risk tier and audit
  link. Kept in its own storage track so a publisher's self-assessment never
  gets confused with third-party review.

Both tracks are versioned (re-attesting increments a counter rather than
silently overwriting) and both are checked for staleness against the live
netlist hash on every read. An attestation whose circuit has since changed is
reported stale immediately, never silently treated as current.

**Layer 3, Network (live, not cached).** Processor seal status and container
activation, re-read at call time.

`CompositionGate.statusReport()` returns every one of these as its own field.
`checkCall()` applies a policy on top and returns an allow/deny plus a
machine-readable reason code. `requireCallAllowed()` does the same check but
reverts instead, for a composing contract that wants to put a single call in
front of its own logic.

## The adapter layer, and why it exists

`CompositionRegistry` and `CompositionGate` never talk to a processor
directly. Every read goes through `ProcessorAdapterRegistry.adapterFor(processor)`,
which resolves to an `IProcessorAdapter`. An unconfigured processor reverts
with `NoAdapterConfigured`, loudly, rather than returning silent zeros that
would look like an empty, harmless circuit.

This exists because of something found while building this: a real Circuit
Netlist Format spec (`Circuits.sol` / `NetlistVM.sol`, described as source-
verified on BscScan) was merged into `TapeOutProtocol/TAPs` as TAP-20 on
2026-10-01, with real selectors (`isCPU(address)` = `0x5f5a364f`), a cited
gas model (2,317 gas/gate), and a documented REF record format
(31 + 3×nIns bytes), checked at the time against live BNB Smart Chain state.
It was renumbered TAP-02 on 2026-10-04. Re-fetching the live repository
directly while writing this build shows neither TAP-02 nor TAP-20 present,
only TAP-01 (merged) and TAP-10 (still an unmerged pull request) remain. The
spec was real, then became unavailable in the authoritative source, for
reasons this build has no way to know.

That instability is the actual finding, not just "the ABI is undocumented."
It means hardcoding any version of that ABI into the core logic would mean
redeploying and re-auditing the whole system every time the spec's status
changes again. The adapter indirection means it doesn't: deploy a new
`IProcessorAdapter` implementation when (or if) a real ABI stabilizes, call
`ProcessorAdapterRegistry.setAdapter(processor, newAdapter)`, and every
existing attestation, policy, and integration keeps working unchanged.

`DirectProcessorAdapter` is the one adapter shipped with this build. It
implements `ITapeOutProcessor`, the provisional interface this project
started with, informed by the since-removed spec but not a transcription of
it. See `contracts/interfaces/ITapeOutProcessor.sol` for the full history and
caveats on every assumed function.

## Verifiability: how to check these claims yourself

Don't take this README's word for any of the following, check it directly:

- **Netlist's own contract state.** Run `npm run verify -- <network> <adapterRegistryAddr> <registryAddr> <gateAddr> [processorAddr] [tokenId]`
  (`scripts/verify.js`). It confirms code is actually deployed at the given
  addresses, that the Gate's registry/adapter-registry pointers are wired
  correctly, prints the live default policy, confirms an unconfigured
  processor reverts rather than silently returning zeros, and if given a
  processor and token ID, pulls `statusReport()` twice from two independent
  calls so you can see it's a live read, with the exact block explorer steps
  to reproduce it yourself without trusting this script at all.
- **The TAP-02/TAP-20 history above.** Re-fetch
  `https://github.com/TapeOutProtocol/TAPs` yourself, the index table is the
  ground truth, not this README, and it can change again.
- **The test suite.** `npm test` runs 19 tests against the real compiled
  contracts on a local EVM, covering ownership enforcement, the publisher/
  auditor split, staleness detection, and policy checks.
- **The demo.** `npm run demo` runs the five-step A→B→C scenario end to end
  and prints a full transcript, including the honest boundary of what gets
  caught versus what doesn't (see Step 5's output).

## Honest limitations, read this before relying on any of it

- **Enforcement vs. advisory.** Whether TapeOut's real circuit-to-circuit call
  mechanism actually forces every composition through a check like this is
  not documented anywhere currently live in TapeKit or the TAPs repo. Treat
  Netlist as an advisory pre-flight check a well-behaved container calls
  voluntarily, not a protocol-enforced guarantee, until that's confirmed.
- **The adapter's assumed ABI is a provisional guess**, informed by a spec
  that existed and then disappeared, not a confirmed interface. Re-verify
  against the live TAPs repository and live chain state before trusting
  `DirectProcessorAdapter` against any real processor, see "Verifiability" above.
- **`estimatedGas` is a flat, documented approximation** (gate count × a
  configurable constant), not a proven upper bound. The 2,317 gas/gate figure
  that was briefly documented in the since-removed TAP-02 is cited above for
  context, not wired into the code as a trusted constant. Don't present
  `estimatedGas` as a safety guarantee on its own, it's a comparison
  benchmark.
- **No recursive dependency verification.** `declaredDepsCount` and
  `depsListHash` are a self-declared count and a hash of an off-chain list.
  Netlist does not currently parse a circuit's actual wiring to discover or
  verify its dependencies automatically, even though the removed TAP-02 spec
  described a REF record type that would make this possible in principle.
  Don't build toward REF-record parsing until a stable, currently-live spec
  actually documents it, see `scripts/demo.js` Step 5 for exactly where this
  boundary sits today.

## Project layout

```
contracts/
  CompositionRegistry.sol            Layer 2 attestations (publisher + auditor tracks)
  CompositionGate.sol                Layer 1 + 2 + 3 status report and policy checks
  ProcessorAdapterRegistry.sol       owner-managed processor -> adapter mapping
  interfaces/
    IProcessorAdapter.sol            the only ABI-assumption boundary
    ITapeOutProcessor.sol            the provisional assumed processor interface
  adapters/
    DirectProcessorAdapter.sol       default adapter implementing ITapeOutProcessor
  mocks/
    MockProcessor.sol                stand-in processor for tests/demo
scripts/
  build.js      compiles everything via the solc npm package (see note below)
  deploy.js     deploys all four contracts to a configured network
  demo.js       runs the 5-step scenario end to end on a local EVM
  verify.js     provability checklist against a live deployment
test/
  CompositionRegistry.test.js
  CompositionGate.test.js
dashboard/
  index.html    standalone status page, reads statusReport() from any RPC
hardhat.config.js   network config (kept for reference/compatibility)
```

### Why `scripts/build.js` exists instead of just `npx hardhat compile`

This repo was built in a sandboxed environment whose network policy blocks
`binaries.soliditylang.org`, which is where Hardhat's compiler downloader
fetches solc from. `scripts/build.js` uses the `solc` npm package directly
instead, pure JS, installed from the npm registry, no further network access
needed. **On a normal machine with unrestricted network access,
`npx hardhat compile` works fine** with the `hardhat.config.js` already in
this repo and produces equivalent output. Both are kept; use whichever your
environment allows.

Tests and the demo script use `ganache` as a local EVM instead of Hardhat
Network, for the same reason, Hardhat's own test runner triggers its compile
task. `hardhat-chai-matchers` (for `revertedWithCustomError`) also requires
the full Hardhat runtime, so `test/helpers.js` includes a small manual
revert-assertion helper that decodes custom errors directly from the
contract's ABI instead.

## Setup

```bash
npm install
npm run build     # compiles contracts -> build/contracts.json
npm test           # runs the full test suite (19 tests) against a local EVM
npm run demo        # runs the 5-step composability scenario
```

## Deploying to X Layer

```bash
cp .env.example .env
# fill in PRIVATE_KEY (needs OKB for gas) and optionally override RPC URLs
npm run deploy:xlayer-testnet
npm run deploy:xlayer-mainnet
```

This deploys `ProcessorAdapterRegistry`, `DirectProcessorAdapter`,
`CompositionRegistry`, and `CompositionGate`, in that order. Nothing is wired
to a real processor automatically: call
`adapterRegistry.setAdapter(<realProcessorAddress>, <adapterAddress>)`
yourself once you've confirmed (see "Verifiability") what adapter actually
matches that processor's real, current ABI. Until then every read for an
unconfigured processor reverts by design.

X Layer is documented as an enhanced OP Stack L2 (migrated from an earlier
Polygon CDK setup). Re-confirm current RPC URLs and chain IDs against
X Layer's own docs before deploying, L2 endpoints do change, and the values
in `hardhat.config.js` are a snapshot from when this was written.

## Revenue model

Publisher attestation writes carry a configurable fee in OKB
(`attestationFee` in `CompositionRegistry`, set to the recipient the
contract's owner chooses), paid by the circuit holder registering, not by
callers checking. Lookups (`statusReport`, `checkCall`) stay free, that's
what drives adoption: every builder on X Layer should be able to check before
composing with zero friction. Auditor attestations are free to write, to
encourage independent review rather than taxing it.

Planned paid tier beyond the MVP: automated dependency-tree scanning for
circuits with deep composition chains, and re-attestation alerts when a
circuit you depend on changes. Positioned as infrastructure other builders on
X Layer integrate, not a standalone consumer product.

## Submission checklist (X Layer TapeOut Accelerate)

- [ ] Re-verify the live TAPs repository's current index before building
      the adapter further, its content has already changed once mid-build
- [ ] Deploy all four contracts to X Layer (testnet first, then mainnet)
- [ ] Find or create real circuits on X Layer to attest against for the
      demo (X Layer's processor population is far smaller than BNB's, you
      may need to create your own sample circuits)
- [ ] Confirm a real adapter against the real processor ABI, then call
      `setAdapter`, then run `scripts/verify.js` against it as evidence
- [ ] Plug the deployed addresses into `dashboard/index.html` and host it, a
      `tape://` DeWEB site via TapeKit is the on-brand option
- [ ] Record the demo video (≤3 min): the blind-composition problem, the
      three-layer fix, the live `scripts/verify.js` output as proof, the OKB
      attestation-fee revenue model
- [ ] Submit processor contract address + circuit ID (or access link) via the
      official Google Form before Dec 7, 2026
