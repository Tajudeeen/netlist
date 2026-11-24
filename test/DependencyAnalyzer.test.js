const { expect } = require("chai");
const { ethers } = require("ethers");
const {
  loadArtifacts, setupProvider, deploy, expectRevert, setupAdapter,
} = require("./helpers");
const fixture = require("./fixtures/xlayer-circuits.json");

// Build a literal TAP-02 REF record: 0x02 | cpu(20) | id(u64) | nIns | nOuts | ins…
function ref(cpu, id, nIns = 0, nOuts = 1, ins = []) {
  let hex = "0x02" + cpu.slice(2).toLowerCase() +
    BigInt(id).toString(16).padStart(16, "0") +
    nIns.toString(16).padStart(2, "0") + nOuts.toString(16).padStart(2, "0");
  for (const i of ins) hex += i.toString(16).padStart(6, "0");
  return hex;
}

describe("DependencyAnalyzer — REF dependency discovery", function () {
  let artifacts, server, provider, deployer, holder;
  let analyzer, processor, reader, adapterRegistry;

  before(async function () {
    artifacts = loadArtifacts();
    const s = await setupProvider();
    server = s.server; provider = s.provider;
    [deployer, holder] = await Promise.all([
      provider.getSigner(0), provider.getSigner(1),
    ]);
  });
  after(async function () { await server.disconnect(); });

  beforeEach(async function () {
    processor = await deploy(artifacts, "MockProcessorV2", deployer);
    adapterRegistry = await setupAdapter(artifacts, deployer, await processor.getAddress());
    reader = await deploy(artifacts, "MockNetlistReader", deployer);
    analyzer = await deploy(artifacts, "DependencyAnalyzer", deployer, [
      await adapterRegistry.getAddress(), await reader.getAddress(),
    ]);
  });

  async function setCircuit(id, netlist, nIn = 2, nOut = 1) {
    await (await processor.setCircuit(
      id, nIn, nOut, 0, 1, netlist, await holder.getAddress()
    )).wait();
  }

  it("discovers one REF target from a real X Layer netlist", async function () {
    // The REF circuit from the committed live fixture.
    const c = fixture.circuits.find((x) => x.processor.toLowerCase() ===
      "0x0565ea48ca41ae559d8d491dbb0a9ec945db551b" && x.tokenId === 1);
    expect(c, "REF circuit in fixture").to.exist;
    await setCircuit(1, c.netlist, c.nIn, c.nOut);
    const r = await analyzer.analyze(await processor.getAddress(), 1, 8, 32);
    expect(Number(r.directRefs)).to.equal(1);
    expect(Number(r.totalCircuits)).to.equal(2); // root + the discovered target
    expect(r.missingTarget).to.equal(true);
    expect(r.complete).to.equal(false); // unreadable target -> fail closed
  });

  it("walks a two-hop A -> B -> C chain and reports depth 2", async function () {
    const p = await processor.getAddress();
    const self = p;
    // C is a leaf (plain NAND); B refs C; A refs B.
    await setCircuit(3, "0x00" + "000000" + "000001");
    await setCircuit(2, ref(self, 3));
    await setCircuit(1, ref(self, 2));
    const r = await analyzer.analyze(p, 1, 8, 32);
    expect(Number(r.directRefs)).to.equal(1);
    expect(Number(r.totalCircuits)).to.equal(3);
    expect(Number(r.maxDepth)).to.equal(2);
    expect(r.cycleDetected).to.equal(false);
    expect(r.missingTarget).to.equal(false);
    expect(r.truncated).to.equal(false);
    expect(r.complete).to.equal(true);
  });

  it("deduplicates shared diamond dependencies but counts every REF instance", async function () {
    const p = await processor.getAddress();
    await setCircuit(4, "0x00" + "000000" + "000001");
    await setCircuit(2, ref(p, 4));
    await setCircuit(3, ref(p, 4));
    await setCircuit(1, ref(p, 2) + ref(p, 3).slice(2));

    const r = await analyzer.analyze(p, 1, 8, 32);
    expect(Number(r.totalCircuits)).to.equal(4);
    expect(Number(r.depCount)).to.equal(3);
    expect(Number(r.expandedInstances)).to.equal(5);
    expect(r.cycleDetected).to.equal(false);
    expect(r.complete).to.equal(true);
  });

  it("counts descendants again when a shared circuit is expanded through repeated REF edges", async function () {
    const p = await processor.getAddress();
    // A references B twice. B references C once. C is one unique identity,
    // but it is evaluated once for each B instance.
    await setCircuit(3, "0x00" + "000000" + "000001");
    await setCircuit(2, ref(p, 3));
    await setCircuit(1, ref(p, 2) + ref(p, 2).slice(2));

    const r = await analyzer.analyze(p, 1, 8, 32);
    expect(Number(r.totalCircuits)).to.equal(3);
    expect(Number(r.depCount)).to.equal(2);
    expect(Number(r.expandedInstances)).to.equal(5);
    expect(r.complete).to.equal(true);
  });

  it("hashes unique direct dependencies in canonical order", async function () {
    const p = await processor.getAddress();
    await setCircuit(4, "0x00" + "000000" + "000001");
    await setCircuit(2, ref(p, 4));
    await setCircuit(3, ref(p, 4));
    await setCircuit(1, ref(p, 2) + ref(p, 3).slice(2));

    const r = await analyzer.analyze(p, 1, 8, 32);
    expect(Number(r.directRefs)).to.equal(2);
    expect(Number(r.directDepsCount)).to.equal(2);
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [[p, p], [2, 3]]
      )
    );
    expect(r.directDepsHash).to.equal(expected);
  });

  it("deduplicates repeated direct REF targets in the declaration hash", async function () {
    const p = await processor.getAddress();
    await setCircuit(2, "0x00" + "000000" + "000001");
    await setCircuit(1, ref(p, 2) + ref(p, 2).slice(2));

    const r = await analyzer.analyze(p, 1, 8, 32);
    expect(Number(r.directRefs)).to.equal(2);
    expect(Number(r.directDepsCount)).to.equal(1);
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [[p], [2]]
      )
    );
    expect(r.directDepsHash).to.equal(expected);
  });

  it("rejects caller limits above the analyzer hard ceiling", async function () {
    await expectRevert(
      analyzer.analyze(await processor.getAddress(), 1, 33, 32),
      "InvalidLimits",
      analyzer
    );
  });

  it("detects a REF cycle instead of looping forever", async function () {
    const p = await processor.getAddress();
    await setCircuit(1, ref(p, 2));
    await setCircuit(2, ref(p, 1));
    const r = await analyzer.analyze(p, 1, 8, 32);
    expect(r.cycleDetected).to.equal(true);
    expect(r.complete).to.equal(false);
  });

  it("reports truncated when maxDepth is exceeded", async function () {
    const p = await processor.getAddress();
    await setCircuit(3, "0x00" + "000000" + "000001");
    await setCircuit(2, ref(p, 3));
    await setCircuit(1, ref(p, 2));
    const r = await analyzer.analyze(p, 1, 1, 32);
    expect(r.truncated).to.equal(true);
    expect(r.complete).to.equal(false);
  });

  it("fails closed for an unconfigured processor", async function () {
    const rogue = await deploy(artifacts, "MockProcessorV2", deployer);
    await expectRevert(
      analyzer.analyze(await rogue.getAddress(), 1, 8, 32),
      "NoAdapterConfigured",
      adapterRegistry
    );
  });

  it("rejects a malformed REF record", async function () {
    await setCircuit(1, "0x02" + "00"); // truncated
    await expectRevert(
      analyzer.analyze(await processor.getAddress(), 1, 8, 32),
      "MalformedNetlist",
      analyzer
    );
  });
});
