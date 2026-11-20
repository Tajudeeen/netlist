// Runs a readable end-to-end scenario against the real compiled contracts on
// a local Ganache EVM: three circuits, a composed dependency chain, and a
// live demonstration of an attestation going stale and the gate catching it.
//
// This is the demo in scripts/build.js + the deployed contracts, printed as a
// transcript you can read straight into a demo video, or screen-record this
// running. Nothing here depends on a real TapeOut network, it uses
// MockProcessor to stand in for three circuits, which is honest for a
// hackathon demo: it proves the contract logic works correctly, it does not
// claim to prove the real TapeOut composition call path invokes this gate
// (see CompositionGate.sol's enforcement-vs-advisory note).

const { ethers } = require("ethers");
const { loadArtifacts, setupProvider, deploy, setupAdapter } = require("../test/helpers");

function hash(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function line(msg) {
  console.log(msg);
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

async function main() {
  const artifacts = loadArtifacts();
  const { server, provider } = await setupProvider();
  const [deployer, ownerA, ownerB, ownerC] = await Promise.all([
    provider.getSigner(0),
    provider.getSigner(1),
    provider.getSigner(2),
    provider.getSigner(3),
  ]);

  section("NETLIST — composability gate demo");
  line("Deploying MockProcessor (stands in for a real TapeOut processor),");
  line("ProcessorAdapterRegistry + DirectProcessorAdapter (the swappable ABI");
  line("layer, see README's verifiability section), CompositionRegistry, and");
  line("CompositionGate...");

  const processor = await deploy(artifacts, "MockProcessor", deployer);
  const adapterRegistry = await setupAdapter(artifacts, deployer, await processor.getAddress());
  const registry = await deploy(artifacts, "CompositionRegistry", deployer, [
    await adapterRegistry.getAddress(),
    0,
    await deployer.getAddress(),
  ]);
  const gate = await deploy(artifacts, "CompositionGate", deployer, [
    await registry.getAddress(),
    await adapterRegistry.getAddress(),
    450, // gasPerGate
  ]);

  line(`  processor:       ${await processor.getAddress()}`);
  line(`  adapterRegistry: ${await adapterRegistry.getAddress()}`);
  line(`  registry:        ${await registry.getAddress()}`);
  line(`  gate:            ${await gate.getAddress()}`);

  section("Scenario: three circuits, A depends on B, B depends on C");

  const A = 1,
    B = 2,
    C = 3;

  await (
    await processor.setCircuit(C, 40, 2, hash("C-netlist-v1"), await ownerC.getAddress())
  ).wait();
  await (await processor.setOwner(C, await ownerC.getAddress())).wait();
  await (await processor.setContainerLive(await ownerC.getAddress(), true)).wait();

  await (
    await processor.setCircuit(B, 80, 3, hash("B-netlist-v1"), await ownerB.getAddress())
  ).wait();
  await (await processor.setOwner(B, await ownerB.getAddress())).wait();
  await (await processor.setContainerLive(await ownerB.getAddress(), true)).wait();

  await (
    await processor.setCircuit(A, 50, 2, hash("A-netlist-v1"), await ownerA.getAddress())
  ).wait();
  await (await processor.setOwner(A, await ownerA.getAddress())).wait();
  await (await processor.setContainerLive(await ownerA.getAddress(), true)).wait();

  await (await processor.setSealed(true)).wait();

  line("Circuit C (leaf): 40 gates, depth 2, owned by ownerC");
  line("Circuit B (depends on C): 80 gates, depth 3, owned by ownerB");
  line("Circuit A (depends on B): 50 gates, depth 2, owned by ownerA");

  section("Step 1 — each circuit holder attests their own circuit");

  await (
    await registry
      .connect(ownerC)
      .attestAsPublisher(
        await processor.getAddress(),
        C,
        0,
        hash("C-deps-none"),
        0, // RiskTier.None
        ""
      )
  ).wait();
  line("  C attested by ownerC: 0 dependencies, risk None");

  await (
    await registry
      .connect(ownerB)
      .attestAsPublisher(
        await processor.getAddress(),
        B,
        1,
        hash("B-deps-[C]"),
        1, // Low
        ""
      )
  ).wait();
  line("  B attested by ownerB: 1 dependency (C), risk Low");

  await (
    await registry
      .connect(ownerA)
      .attestAsPublisher(
        await processor.getAddress(),
        A,
        1,
        hash("A-deps-[B]"),
        1, // Low
        ""
      )
  ).wait();
  line("  A attested by ownerA: 1 dependency (B), risk Low");

  section("Step 2 — a composing caller checks the gate before calling into each circuit");

  const policy = Array.from(await gate.defaultPolicy());

  for (const [label, tokenId] of [
    ["A", A],
    ["B", B],
    ["C", C],
  ]) {
    const [allowed, reason] = await gate.checkCall(
      await processor.getAddress(),
      tokenId,
      policy
    );
    line(`  checkCall(${label}) -> allowed=${allowed} reason="${reason}"`);
  }

  section("Step 3 — C gets re-wired after attestation (netlist changes)");
  line("Someone modifies circuit C's netlist, new gate count, new wiring,");
  line("without C's holder re-attesting.");

  await (
    await processor.setCircuit(C, 95, 5, hash("C-netlist-v2-REWIRED"), await ownerC.getAddress())
  ).wait();

  section("Step 4 — C's old attestation is now stale, the gate catches it live");

  const [cAllowed, cReason] = await gate.checkCall(
    await processor.getAddress(),
    C,
    policy
  );
  line(`  checkCall(C) -> allowed=${cAllowed} reason="${cReason}"`);
  line("  The attestation record still exists in storage, but getPublisherAttestation()");
  line("  re-checks the live netlist hash on every read and reports it stale. The gate");
  line("  treats a stale attestation the same as a failing one under the default policy.");

  section("Step 5 — B and A were never re-checked against C directly");
  line("Netlist's current scope: the gate checks the circuit you call directly, not a");
  line("recursive walk through declared dependencies. B still reports allowed=true here,");
  line("because B's own attestation and B's own netlist haven't changed:");

  const [bAllowed, bReason] = await gate.checkCall(
    await processor.getAddress(),
    B,
    policy
  );
  line(`  checkCall(B) -> allowed=${bAllowed} reason="${bReason}"`);
  line("");
  line("  This is the honest, current boundary of what Netlist verifies: a composing");
  line("  caller who checks C directly before using it gets caught immediately. A caller");
  line("  who only checks B gets B's own facts, not a recursive guarantee about what B");
  line("  itself depends on. Recursive dependency verification (chasing B's declared");
  line("  dependency on C and checking it transitively) is a named stretch goal, not");
  line("  something this build claims to do yet. See README.md, Phase 3.");

  section("Done");

  await server.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
