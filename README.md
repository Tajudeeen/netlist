# Netlist

**Live demo: https://tajudeeen.github.io/netlist/** — reads real circuits from X Layer in-browser, no deploy key needed.

A composability gate for TapeOut circuits on X Layer. Built for X Layer
TapeOut Accelerate.

Composing someone else's circuit today means trusting it blind: no visibility
into gas cost, dependency depth, or whether the processor it lives on is even
sealed. Netlist fixes that with three layers of fact, kept deliberately
separate instead of collapsed into one "is this safe" boolean.

## What Is Actually Real (read this first)

Evidence, not claims. Every item below was re-run on 2026-11-20:

| Claim | Status | How to reproduce |
|---|---|---|
| 14 Solidity contracts compile; 29 tests pass on a local EVM | REAL | `npm test` |
| Real TAP-02 netlist decoder agrees with an independent JS decoder on 9 circuits fetched from **live X Layer mainnet** | REAL | `npm test` (fixture: `test/fixtures/xlayer-circuits.json`) |
| Decoder agrees with each processor's own `circuitInfo().gateCount` on all 6 non-REF live circuits | REAL | `npm run verify:xlayer` |
| 436 real TapeOut processors exist on X Layer; factory/beacon/opener/payments code verified at the TAP-02/TAP-10 addresses | REAL | `npm run verify:xlayer` (chainId 196, eth_getCode + eth_call) |
| `TapeOutV2Adapter` implements the real TAP-02/TAP-10 ABI and plugs into the unchanged core contracts | REAL | `npm test` (last test: full attestation → gate check) |
| Recursive REF dependency verification | REAL (off-chain verifier) | `npm run verify:refs` — walks REF closure on live X Layer; matches `circuitInfo.gateCount` |
| Dashboard reads real circuits directly in-browser | REAL | `dashboard/index.html` — live explorer, no gate deploy needed |
| Netlist's own contracts deployed on X Layer | **NOT YET** — no private key in this repo | see "Deploying to X Layer" |
| Protocol-enforced composition checks (all calls forced through the gate) | **NOT VERIFIED** — advisory only | see "Honest limitations" |
| On-chain recursive REF verification inside the Solidity adapter | **NOT IMPLEMENTED** — off-chain verifier only | see "Honest limitations" |

Re-fetch the fixture any time with `node scripts/fetch-xlayer-fixtures.js`
(requires network). The fixture is committed so tests never depend on network.

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

This is what makes Netlist possible on X Layer: real Circuit Netlist Format
specs **are live** in `TapeOutProtocol/TAPs` (TAP-02, "Circuit Netlist Format
and Evaluation Semantics", and TAP-10, "DeWEB Access and Messaging Layers").
They document literal on-chain netlists — NAND/LATCH/REF records — not opaque
bytecode, so gate count, depth and netlist hash can be *derived* rather than
self-reported. Selectors and addresses were verified by live `eth_call` on X
Layer (196) on 2026-11-20:

- processor: `circuitInfo(id)` = `0x084d60f1`, `netlist(id)` = `0x3fc4be56`
- factory: `isCPU(address)` = `0x5f5a364f`, `isSealed()` = `0x631f9852`,
  `cpuCount()` = `0xa94da8a7`, currently **436 processors**
- container opener `0x536adD8F…0106`, payments `0x68809Fd2…6f9`
  (TAP-10 Deployments)

The adapter indirection still matters: TAP-02 was briefly absent from the
repository earlier in this build, and the L2 processor ABI may differ from the
BNB one. A new `IProcessorAdapter` implementation can be deployed and swapped
with `setAdapter(processor, newAdapter)` without touching any core contract,
attestation, or policy.

Two adapters ship:
- `DirectProcessorAdapter` — the original provisional guess interface
  (`ITapeOutProcessor.sol`), kept for the local demo and mock processor.
- `TapeOutV2Adapter` — **the real one**, reading actual TAP-02/TAP-10
  contracts. It decodes netlist bytes on chain (bounded parser in
  `TapNetlist.sol`), derives the staleness hash as `keccak256(netlist(id))`,
  derives containers via `opener.accountOf`, and checks activation via
  `payments.isContainerLive` (TAP-10 §6.3: a reverting call is false).
  Use this one against real processors.

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
- **Live adapter correctness.** `npm run verify:xlayer` reads real circuits
  from X Layer mainnet, checks `eth_getCode` at the TAP-02/TAP-10 addresses,
  and cross-checks decoded gate count against each processor's own
  `circuitInfo()` — with the honest gaps printed at the end. Requires network.
  `npm run verify:refs` separately walks REF closures against live circuits.
- **The TAP-02/TAP-10 specs.** Re-fetch `https://github.com/TapeOutProtocol/TAPs`
  yourself; the index table and `TAPs/TAP-02.md` / `TAPs/TAP-10.md` are ground
  truth, not this README, and can change again.
- **The test suite.** `npm test` runs 33 tests against the real compiled
  contracts on a local EVM, covering the original 19 (ownership, publisher/
  auditor split, staleness, policy) plus 10 real-adapter tests (including a
  differential check of the Solidity decoder vs an independent JS decoder on
  9 circuits fetched from live X Layer) and 4 REF-parser unit tests.
- **The demo.** `npm run demo` runs the five-step A→B→C scenario end to end
  and prints a full transcript, including the honest boundary of what gets
  caught versus what doesn't (see Step 5's output).

## Honest limitations, read this before relying on any of it

- **Enforcement vs. advisory.** Whether TapeOut's real circuit-to-circuit call
  mechanism actually forces every composition through a check like this is
  not documented anywhere currently live in TapeKit or the TAPs repo. Treat
  Netlist as an advisory pre-flight check a well-behaved container calls
  voluntarily, not a protocol-enforced guarantee, until that's confirmed.
- **The real adapter's assumptions are now verified but narrow.** TAP-02 and
  TAP-10 are live and their addresses/selectors were checked on X Layer; the
  adapter fails closed for non-TapeOut processors, malformed netlists, and
  reverting payments calls. But TAP-02 itself states its verified-source
  comparison applies **to BNB Smart Chain only**; the L2 processor ABI was
  confirmed here by direct selector calls and netlist decoding, not by source
  verification. Re-run `npm run verify:xlayer` before relying on it.
- **Seal status fails closed on live X Layer.** TAP-10 §13.8 defines a seal as
  factory sealed + beacon implementation pinned + `beacon.owner() == factory`.
  Live X Layer reports `beacon.owner() == 0x0`, so `isSealed()` returns false
  even for real circuits. `sealEvidence()` exposes the three claims
  separately rather than hiding the discrepancy behind one boolean.
- **`estimatedGas` is a flat, documented approximation** (gate count × a
  configurable constant), not a proven upper bound. The 2,317 gas/gate figure
  measured for one 1,204-gate circuit in TAP-02 is cited for context, not
  wired in as a trusted constant. Don't present it as a safety guarantee on
  its own, it's a comparison benchmark.
- **REF closure is verified off-chain, not on-chain.** `scripts/ref-closure.js`
  walks REF targets from the netlist bytes and `npm run verify:refs` proves the
  closure against live X Layer (a real REF circuit's 10 reported gates are
  reproduced by walking its one target). But doing this inside a Solidity
  adapter would require an unbounded number of external calls, so the on-chain
  `depthIsBounded()` still only flags that a circuit composes others — it does
  not produce a transitive bound. A caller needing a hard guarantee must use
  the verifier or reject REF circuits. `declaredDepsCount` remains self-declared.

## Project layout

```
contracts/
  CompositionRegistry.sol            Layer 2 attestations (publisher + auditor tracks)
  CompositionGate.sol                Layer 1 + 2 + 3 status report and policy checks
  ProcessorAdapterRegistry.sol       owner-managed processor -> adapter mapping
  interfaces/
    IProcessorAdapter.sol            the only ABI-assumption boundary
    ITapeOutProcessor.sol            the original provisional interface (mock path)
    ITapeOutV2.sol                   REAL TAP-02/TAP-10 interfaces (verified)
  adapters/
    DirectProcessorAdapter.sol       demo adapter implementing ITapeOutProcessor
    TapeOutV2Adapter.sol             REAL adapter for live TapeOut contracts
  libraries/
    TapNetlist.sol                   bounded on-chain TAP-02 decoder + depth math
  mocks/
    MockProcessor.sol                stand-in processor for tests/demo
    V2Mocks.sol                      TAP-02/TAP-10 mock processor + companions
scripts/
  build.js      compiles everything via the solc npm package (see note below)
  deploy.js     deploys all four contracts to a configured network
  demo.js       runs the 5-step scenario end to end on a local EVM
  verify.js     provability checklist against a live deployment
  verify-xlayer.js  LIVE adapter cross-check against real X Layer circuits
  ref-closure.js    recursive TAP-02 REF walker (off-chain verifier)
  verify-ref.js     LIVE REF-closure cross-check (npm run verify:refs)
  fetch-xlayer-fixtures.js  refreshes the committed real-circuit test fixture
test/
  CompositionRegistry.test.js
  CompositionGate.test.js
  TapeOutV2Adapter.test.js  10 tests incl. differential decode on real circuits
  RefClosure.test.js         4 offline parser unit tests
  decoder.js                independent JS TAP-02 decoder (test oracle)
  fixtures/xlayer-circuits.json  9 circuits fetched via eth_call on X Layer
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
npm test           # runs the full suite (33 tests) against a local EVM
npm run demo        # runs the 5-step composability scenario
npm run verify:xlayer  # LIVE cross-check against real X Layer circuits (needs network)
npm run verify:refs    # LIVE recursive REF-closure cross-check (needs network)
```

## Using the real adapter on X Layer

```js
// deployed TapeOut V2 addresses on X Layer (196), from TAP-02/TAP-10:
const adapter = await ethers.deployContract("TapeOutV2Adapter", [
  "0x1f09DAeFA827f02CBb40967cc91b259763760761", // factory
  "0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C", // beacon
  "0x536adD8F30f03b69f6fbF29d425A816A0dC50106", // opener
  "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9", // payments
  "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2", // pinned circuit impl
]);
// then: adapterRegistry.setAdapter(realProcessor, await adapter.getAddress())
```

After that the unchanged `CompositionRegistry` / `CompositionGate` work
against real circuits, including `keccak256(netlist)` staleness and real
container activation. `analyzeCircuit()` additionally cross-checks the
decoded gate count against `circuitInfo()`; `sealEvidence()` shows the three
seal claims separately; `depthIsBounded()` is false for REF circuits.


## Deploying to X Layer

```bash
cp .env.example .env
# fill in PRIVATE_KEY (needs OKB for gas) and optionally override RPC URLs
npm run deploy:xlayer-testnet
npm run deploy:xlayer-mainnet
```

This deploys `ProcessorAdapterRegistry`, `DirectProcessorAdapter`,
`CompositionRegistry`, and `CompositionGate`, in that order. To use real
circuits, deploy `TapeOutV2Adapter` with the X Layer TAP-02/TAP-10 addresses
above and call
`adapterRegistry.setAdapter(<realProcessorAddress>, <v2AdapterAddress>)`.
Nothing is wired to a real processor automatically; until then every read for
an unconfigured processor reverts by design.

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

- [x] Re-verify the live TAPs repository index (TAP-02 and TAP-10 are live as
      of 2026-11-20) and build the real adapter against it
- [x] Confirm a real adapter against the real processor ABI (`eth_call` on 436
      processors; `npm run verify:xlayer` cross-checks decoded gate counts
      against `circuitInfo()` on 9 live circuits)
- [x] Recursive REF closure verified against live X Layer (`npm run verify:refs`
      reproduces a real REF circuit's gate count by walking its target).
      On-chain transitive bound remains a documented limitation.
- [ ] Deploy all four contracts to X Layer (testnet first, then mainnet) —
      BLOCKED: no `PRIVATE_KEY` in this environment
- [ ] Deploy `TapeOutV2Adapter`, call `setAdapter` for a real processor, and
      run `scripts/verify.js` against the deployed Gate as on-chain evidence
- [ ] Plug the deployed addresses into `dashboard/index.html` and host it, a
      `tape://` DeWEB site via TapeKit is the on-brand option
- [ ] Record the demo video (≤3 min): the blind-composition problem, the
      three-layer fix, the live `scripts/verify.js` output as proof, the OKB
      attestation-fee revenue model
- [ ] Submit processor contract address + circuit ID (or access link) via the
      official Google Form before Dec 7, 2026
- [ ] Stretch: on-chain recursive REF verification (walk REF targets from
      `netlist()` bytes inside a Solidity adapter with bounded depth)
