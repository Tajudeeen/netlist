// Runs the A -> B -> C composition scenario against the real compiled
// contracts on a local Ganache EVM. This is the reviewer-requested demo:
// dependencies are discovered from actual TAP-02 REF records, not from a
// self-declared list, and a stale downstream circuit propagates the denial
// up to A.
//
// Honest boundary: this proves the contract logic works. It does NOT claim
// TapeOut's real execution path invokes our gate (see CompositionGate.sol).

const { ethers } = require("ethers");
const { loadArtifacts, setupProvider, deploy, setupAdapter } = require("../test/helpers");

const hash = (label) => ethers.keccak256(ethers.toUtf8Bytes(label));
const line = (msg) => console.log(msg);
function section(title) {
  console.log("\n" + "=".repeat(64));
  console.log(title);
  console.log("=".repeat(64));
}

// A real TAP-02 REF record: 0x02 | cpu(20) | id(u64) | nIns | nOuts
function refRecord(cpu, id) {
  return "0x02" + cpu.slice(2).toLowerCase() +
    BigInt(id).toString(16).padStart(16, "0") + "0001";
}
const NAND_NETLIST = "0x00" + "000000" + "000001";

async function main() {
  const artifacts = loadArtifacts();
  const { server, provider } = await setupProvider();
  const [deployer, ownerA, ownerB, ownerC] = await Promise.all([
    provider.getSigner(0), provider.getSigner(1),
    provider.getSigner(2), provider.getSigner(3),
  ]);

  section("NETLIST — dependency-aware composability demo");

  const processor = await deploy(artifacts, "MockProcessorV2", deployer);
  const p = await processor.getAddress();
  const factory = await deploy(artifacts, "MockFactoryV2", deployer);
  const beacon = await deploy(artifacts, "MockBeacon", deployer, [
    "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2",
    ethers.ZeroAddress, // live X Layer shape
  ]);
  const opener = await deploy(artifacts, "MockOpener", deployer);
  const payments = await deploy(artifacts, "MockPayments", deployer);
  const adapter = await deploy(artifacts, "TapeOutV2Adapter", deployer, [
    await factory.getAddress(), await beacon.getAddress(),
    await opener.getAddress(), await payments.getAddress(),
    "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2",
  ]);
  await (await factory.setCPU(p, true)).wait();
  await (await factory.setSealed(true)).wait();
  await (await beacon.setOwner(await factory.getAddress())).wait();

  const adapterRegistry = await deploy(artifacts, "ProcessorAdapterRegistry", deployer);
  await (await adapterRegistry.setAdapter(p, await adapter.getAddress())).wait();
  const reader = await deploy(artifacts, "MockNetlistReader", deployer);
  const analyzer = await deploy(artifacts, "DependencyAnalyzer", deployer, [
    await adapterRegistry.getAddress(), await reader.getAddress(),
  ]);
  const registry = await deploy(artifacts, "CompositionRegistry", deployer, [
    await adapterRegistry.getAddress(), 0, await deployer.getAddress(),
  ]);
  const gate = await deploy(artifacts, "CompositionGate", deployer, [
    await registry.getAddress(), await adapterRegistry.getAddress(), 450,
  ]);

  line(`  processor:  ${p}`);
  line(`  gate:       ${await gate.getAddress()}`);
  line(`  analyzer:   ${await analyzer.getAddress()}`);
  line("  All reads go through the real TAP-02 adapter; dependencies come from REF bytes.");

  const A = 1, B = 2, C = 3;
  async function setCircuit(id, netlist, owner) {
    await (await processor.setCircuit(id, 2, 1, 0, 4, netlist, await owner.getAddress())).wait();
  }
  async function attest(id, owner) {
    await (await registry.connect(owner).attestAsPublisher(
      p, id, 0, ethers.ZeroHash, 1, ""
    )).wait();
  }

  section("Scenario: A composes B, B composes C — discovered from REF records");
  await setCircuit(C, NAND_NETLIST, ownerC);
  await setCircuit(B, refRecord(p, C), ownerB);
  await setCircuit(A, refRecord(p, B), ownerA);
  await attest(A, ownerA); await attest(B, ownerB); await attest(C, ownerC);
  for (const id of [A, B, C]) {
    const c = await adapter.containerOf(p, id);
    await (await payments.setLive(c, true)).wait();
  }
  line("  C: leaf NAND netlist");
  line(`  B: REF -> ${p.slice(0, 10)}… #${C}`);
  line(`  A: REF -> ${p.slice(0, 10)}… #${B}`);
  line("  All three attested by their holders against their current netlist hashes.");

  section("Step 1 — direct-only check passes for A");
  const policy = Array.from(await gate.defaultPolicy());
  const [a1, r1] = await gate.checkCall(p, A, policy);
  line(`  checkCall(A) -> allowed=${a1} reason="${r1}"`);
  const dep1 = await analyzer.analyze(p, A, 8, 32);
  line(`  dependency walk: ${dep1.totalCircuits} circuits, depth ${dep1.maxDepth}, ` +
       `complete=${dep1.complete}`);
  const [ad1, ard1] = await gate.checkCallWithDependencies(
    p, A, policy, await analyzer.getAddress(), 8, 32);
  line(`  checkCallWithDependencies(A) -> allowed=${ad1} reason="${ard1}"`);

  section("Step 2 — C's netlist is rewired, its attestation goes stale");
  await setCircuit(C, "0x00" + "000001" + "000002", ownerC);
  line("  C netlist changed; C's holder did not re-attest.");
  const [c2, rc2] = await gate.checkCall(p, C, policy);
  line(`  checkCall(C) -> allowed=${c2} reason="${rc2}"`);

  section("Step 3 — the stale risk propagates to B, then A");
  const [b3, rb3] = await gate.checkCallWithDependencies(
    p, B, policy, await analyzer.getAddress(), 8, 32);
  line(`  checkCallWithDependencies(B) -> allowed=${b3} reason="${rb3}"`);
  const [a3, ra3] = await gate.checkCallWithDependencies(
    p, A, policy, await analyzer.getAddress(), 8, 32);
  line(`  checkCallWithDependencies(A) -> allowed=${a3} reason="${ra3}"`);
  line("  The REF closure is walked live; a stale attestation deep in the chain");
  line("  denies the parent composition, not just the circuit called directly.");

  section("Step 4 — re-attest C and the chain passes again");
  await attest(C, ownerC);
  const [a4, ra4] = await gate.checkCallWithDependencies(
    p, A, policy, await analyzer.getAddress(), 8, 32);
  line(`  checkCallWithDependencies(A) -> allowed=${a4} reason="${ra4}"`);
  line("  Re-attestation restores the chain. Version counters preserve history.");

  section("Done");
  await server.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
