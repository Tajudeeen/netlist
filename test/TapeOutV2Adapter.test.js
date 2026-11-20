const { expect } = require("chai");
const { ethers } = require("ethers");
const {
  loadArtifacts,
  setupProvider,
  deploy,
  expectRevert,
} = require("./helpers");
const { decodeTapNetlist } = require("./decoder");
const fixture = require("./fixtures/xlayer-circuits.json");

// A TAP-02 netlist of 3 NAND gates: constants 0/1 + 1 input -> signals 0..2,
// each NAND references earlier signals, producing signals 3,4,5.
const THREE_NAND = "0x" + "00" + "000000" + "000001" + "00" + "000001" + "000002" + "00" + "000003" + "000004";
// A LATCH with a forward d (feedback): nIn=0, d=2 (the latch's own output).
const FEEDBACK_LATCH = "0x" + "01" + "000002";

describe("TapeOutV2Adapter — real TAP-02 decoder, differentially tested", function () {
  let artifacts, server, provider, deployer, holder;
  let factory, beacon, opener, payments, adapter, processor;
  let chainId;

  const impl = "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2";

  before(async function () {
    artifacts = loadArtifacts();
    const setup = await setupProvider();
    server = setup.server;
    provider = setup.provider;
    [deployer, holder] = await Promise.all([
      provider.getSigner(0),
      provider.getSigner(1),
    ]);
  });

  after(async function () {
    await server.disconnect();
  });

  beforeEach(async function () {
    factory = await deploy(artifacts, "MockFactoryV2", deployer);
    beacon = await deploy(artifacts, "MockBeacon", deployer, [
      impl,
      ethers.ZeroAddress, // live X Layer beacon.owner() == address(0)
    ]);
    opener = await deploy(artifacts, "MockOpener", deployer);
    payments = await deploy(artifacts, "MockPayments", deployer);
    adapter = await deploy(artifacts, "TapeOutV2Adapter", deployer, [
      await factory.getAddress(),
      await beacon.getAddress(),
      await opener.getAddress(),
      await payments.getAddress(),
      impl,
    ]);
    processor = await deploy(artifacts, "MockProcessorV2", deployer);
    await (await factory.setCPU(await processor.getAddress(), true)).wait();
    chainId = (await provider.getNetwork()).chainId;
  });

  function setCircuit(id, nIn, nOut, nState, gateCount, netlist, holderAddr) {
    return processor.setCircuit(
      id,
      nIn,
      nOut,
      nState,
      gateCount,
      netlist,
      holderAddr
    );
  }

  it("matches an independent JS decoder on 9 REAL X Layer circuits (live-fetched)", async function () {
    for (const c of fixture.circuits) {
      await (
        await setCircuit(
          c.tokenId,
          c.nIn,
          c.nOut,
          c.nState,
          c.gateCount,
          c.netlist,
          c.owner || (await holder.getAddress())
        )
      ).wait();

      const expected = decodeTapNetlist(c.netlist, c.nIn);
      const analysis = await adapter.analyzeCircuit(
        await processor.getAddress(),
        c.tokenId
      );

      expect(Number(analysis.analysis.gateCount)).to.equal(expected.gateCount);
      expect(Number(analysis.analysis.depth)).to.equal(expected.depth);
      expect(Number(analysis.analysis.signals)).to.equal(expected.signals);
      expect(analysis.analysis.hasRef).to.equal(expected.hasRef);
      // TAP-02 §6: circuitInfo.gateCount includes REF sub-circuits, so the
      // cross-check only runs for non-REF circuits (analyzeCircuit reverts
      // on mismatch there — if this passes, the counts agree).
      expect(Number(analysis.reportedGateCount)).to.equal(c.gateCount);
    }
  });

  it("hashes the real netlist bytes for staleness (not a guessed selector)", async function () {
    const nl = "0x1234567890abcdef";
    await (
      await setCircuit(1, 2, 1, 0, 3, nl, await holder.getAddress())
    ).wait();
    const onchain = await adapter.netlistHash(await processor.getAddress(), 1);
    expect(onchain).to.equal(ethers.keccak256(nl));
  });

  it("fail-closed: rejects a processor the factory does not recognise", async function () {
    const rogue = await deploy(artifacts, "MockProcessorV2", deployer);
    await expectRevert(
      adapter.gateCount(await rogue.getAddress(), 1),
      "NotTapeOutProcessor",
      adapter
    );
  });

  it("fail-closed: rejects a malformed netlist (bad opcode)", async function () {
    await (
      await setCircuit(1, 0, 1, 0, 1, "0xff", await holder.getAddress())
    ).wait();
    await expectRevert(
      adapter.gateCount(await processor.getAddress(), 1),
      "MalformedNetlist",
      adapter
    );
  });

  it("detects a forward-NAND reference (TAP-02 §3 condition 4)", async function () {
    // nIn=0 -> signals 0,1; NAND with a=2 which does not exist yet.
    await (
      await setCircuit(1, 0, 1, 0, 1, "0x00" + "000002" + "000001", await holder.getAddress())
    ).wait();
    await expectRevert(
      adapter.gateCount(await processor.getAddress(), 1),
      "MalformedNetlist",
      adapter
    );
  });

  it("treats a forward LATCH as feedback, bounded depth of 1", async function () {
    await (
      await setCircuit(1, 0, 1, 1, 1, FEEDBACK_LATCH, await holder.getAddress())
    ).wait();
    const analysis = await adapter.analyzeCircuit(await processor.getAddress(), 1);
    expect(analysis.analysis.hasForwardLatch).to.equal(true);
    expect(Number(analysis.analysis.depth)).to.equal(1);
    // independent JS oracle agrees
    expect(Number(analysis.analysis.depth)).to.equal(
      decodeTapNetlist(FEEDBACK_LATCH, 0).depth
    );
  });

  it("isSealed requires factory seal AND beacon pinning AND factory ownership (TAP-10 §13.8)", async function () {
    await (
      await setCircuit(1, 0, 1, 0, 0, "0x", await holder.getAddress())
    ).wait();
    const p = await processor.getAddress();
    // Live-X-Layer-shaped state: beacon owner is zero -> never sealed.
    let ev = await adapter.sealEvidence(p);
    expect(ev.factorySealed).to.equal(false);
    expect(ev.implementationMatches).to.equal(true);
    expect(ev.beaconOwnedByFactory).to.equal(false);
    expect(await adapter.isSealed(p)).to.equal(false);

    await (await factory.setSealed(true)).wait();
    expect(await adapter.isSealed(p)).to.equal(false); // owner still wrong

    // Spec-satisfying seal: factory owns the beacon.
    await (await beacon.setOwner(await factory.getAddress())).wait();
    ev = await adapter.sealEvidence(p);
    expect(ev.beaconOwnedByFactory).to.equal(true);
    expect(await adapter.isSealed(p)).to.equal(true);

    // Beacon upgraded away from reviewed impl -> false again.
    await (await beacon.setImplementation(ethers.ZeroAddress)).wait();
    expect(await adapter.isSealed(p)).to.equal(false);
  });

  it("treats a reverting payments.isContainerLive as false (TAP-10 §6.3)", async function () {
    const rev = await deploy(artifacts, "MockPaymentsReverting", deployer);
    const a2 = await deploy(artifacts, "TapeOutV2Adapter", deployer, [
      await factory.getAddress(),
      await beacon.getAddress(),
      await opener.getAddress(),
      await rev.getAddress(),
      impl,
    ]);
    await (
      await setCircuit(1, 0, 1, 0, 0, "0x", await holder.getAddress())
    ).wait();
    expect(
      await a2.isContainerLive(
        await processor.getAddress(),
        "0x0000000000000000000000000000000000000001"
      )
    ).to.equal(false);
  });

  it("ownerOf comes from the real circuit NFT", async function () {
    await (
      await setCircuit(1, 0, 1, 0, 0, "0x", await holder.getAddress())
    ).wait();
    expect(await adapter.ownerOf(await processor.getAddress(), 1)).to.equal(
      await holder.getAddress()
    );
  });

  it("checkCallWithDependencies denies a circuit whose REF target is incomplete", async function () {
    const adapterRegistry = await deploy(artifacts, "ProcessorAdapterRegistry", deployer);
    const p = await processor.getAddress();
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

    // A refs circuit #99 which has no netlist on this processor.
    await (
      await processor.setCircuit(1, 2, 1, 0, 1,
        "0x02" + p.slice(2).toLowerCase() + "0000000000000063" + "00" + "01",
        await holder.getAddress())
    ).wait();
    await (await factory.setCPU(p, true)).wait();
    await (
      await registry.connect(holder).attestAsPublisher(p, 1, 0, ethers.ZeroHash, 1, "")
    ).wait();
    await (await factory.setSealed(true)).wait();
    await (await beacon.setOwner(await factory.getAddress())).wait();
    const container = await adapter.containerOf(p, 1);
    await (await payments.setLive(container, true)).wait();

    const policy = Array.from(await gate.defaultPolicy());
    const plain = await gate.checkCall(p, 1, policy);
    expect(plain[0]).to.equal(true); // the direct-only check misses the risk

    const deep = await gate.checkCallWithDependencies(p, 1, policy,
      await analyzer.getAddress(), 8, 32);
    expect(deep[0]).to.equal(false);
    expect(deep[1]).to.equal("dep-missing");
  });

  it("works unchanged as an IProcessorAdapter for CompositionRegistry", async function () {
    // Register the real adapter for the processor and run a publisher
    // attestation + gate check through the untouched core contracts.
    const adapterRegistry = await deploy(
      artifacts,
      "ProcessorAdapterRegistry",
      deployer
    );
    await (
      await adapterRegistry.setAdapter(
        await processor.getAddress(),
        await adapter.getAddress()
      )
    ).wait();
    const registry = await deploy(artifacts, "CompositionRegistry", deployer, [
      await adapterRegistry.getAddress(),
      0,
      await deployer.getAddress(),
    ]);
    const gate = await deploy(artifacts, "CompositionGate", deployer, [
      await registry.getAddress(),
      await adapterRegistry.getAddress(),
      450,
    ]);
    await (
      await setCircuit(1, 2, 1, 0, 3, THREE_NAND, await holder.getAddress())
    ).wait();
    await (
      await factory.setCPU(await processor.getAddress(), true)
    ).wait();
    await (
      await registry
        .connect(holder)
        .attestAsPublisher(
          await processor.getAddress(),
          1,
          0,
          ethers.ZeroHash,
          1,
          ""
        )
    ).wait();
    await (await factory.setSealed(true)).wait();
    await (await beacon.setOwner(await factory.getAddress())).wait();
    const container = await adapter.containerOf(await processor.getAddress(), 1);
    await (await payments.setLive(container, true)).wait();
    const policy = Array.from(await gate.defaultPolicy());
    const [allowed, reason] = await gate.checkCall(
      await processor.getAddress(),
      1,
      policy
    );
    expect(allowed).to.equal(true);
    expect(reason).to.equal("");
  });
});
