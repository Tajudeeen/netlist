const { expect } = require("chai");
const { ethers } = require("ethers");
const { loadArtifacts, setupProvider, deploy } = require("./helpers");

function ref(processor, id) {
  return "0x02" + processor.slice(2).toLowerCase() +
    BigInt(id).toString(16).padStart(16, "0") + "00" + "01";
}

describe("CompositionGate — dependency-aware policy", function () {
  let artifacts, server, provider, deployer, holder;
  let processor, factory, beacon, adapter, adapterRegistry, registry, analyzer, gate;
  const pinnedImplementation = "0x0000000000000000000000000000000000000001";

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
    processor = await deploy(artifacts, "MockProcessorV2", deployer);
    factory = await deploy(artifacts, "MockFactoryV2", deployer);
    beacon = await deploy(artifacts, "MockBeacon", deployer, [
      pinnedImplementation,
      await factory.getAddress(),
    ]);
    const opener = await deploy(artifacts, "MockOpener", deployer);
    const payments = await deploy(artifacts, "MockPayments", deployer);
    await (await factory.setCPU(await processor.getAddress(), true)).wait();
    await (await factory.setSealed(true)).wait();

    adapter = await deploy(artifacts, "TapeOutV2Adapter", deployer, [
      await factory.getAddress(),
      await beacon.getAddress(),
      await opener.getAddress(),
      await payments.getAddress(),
      pinnedImplementation,
    ]);
    adapterRegistry = await deploy(artifacts, "ProcessorAdapterRegistry", deployer);
    await (await adapterRegistry.setDefaultAdapter(await adapter.getAddress())).wait();

    registry = await deploy(artifacts, "CompositionRegistry", deployer, [
      await adapterRegistry.getAddress(),
      0,
      await deployer.getAddress(),
    ]);
    analyzer = await deploy(artifacts, "DependencyAnalyzer", deployer, [
      await adapterRegistry.getAddress(),
      await adapter.getAddress(),
    ]);
    gate = await deploy(artifacts, "CompositionGate", deployer, [
      await registry.getAddress(),
      await adapterRegistry.getAddress(),
      450,
    ]);
  });

  async function setCircuit(id, netlist) {
    const hasRef = netlist.toLowerCase().includes("02");
    await (await processor.setCircuit(
      id,
      hasRef ? 0 : 2,
      1,
      0,
      hasRef ? 1 : 1,
      netlist,
      await holder.getAddress()
    )).wait();
  }

  function dependencyHash(ids) {
    if (ids.length === 0) return ethers.ZeroHash;
    const p = ethers.getAddress(processor.target);
    const sorted = [...ids].sort((a, b) => a - b);
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [sorted.map(() => p), sorted]
      )
    );
  }

  async function attest(id, directIds = []) {
    await (await registry.connect(holder).attestAsPublisher(
      await processor.getAddress(),
      id,
      directIds.length,
      dependencyHash(directIds),
      1,
      ""
    )).wait();
  }

  const policy = [0, 4, 2, false, false, true, true, false];

  async function check(rootId = 1) {
    return gate.checkCallWithDependencies(
      await processor.getAddress(),
      rootId,
      policy,
      await analyzer.getAddress(),
      8,
      32
    );
  }

  it("allows a circuit when discovered direct dependencies match the publisher commitment", async function () {
    const p = await processor.getAddress();
    await setCircuit(2, "0x00" + "000000" + "000001");
    await setCircuit(1, ref(p, 2));
    await attest(2);
    await attest(1, [2]);

    const [allowed, reason] = await check();
    expect(allowed).to.equal(true);
    expect(reason).to.equal("");
  });

  it("rejects a publisher dependency commitment that differs from the live REF records", async function () {
    const p = await processor.getAddress();
    await setCircuit(2, "0x00" + "000000" + "000001");
    await setCircuit(1, ref(p, 2));
    await attest(2);
    await attest(1, [3]);

    const [allowed, reason] = await check();
    expect(allowed).to.equal(false);
    expect(reason).to.equal("dep-declaration-mismatch");
  });

  it("propagates a stale transitive attestation to the root circuit", async function () {
    const p = await processor.getAddress();
    await setCircuit(3, "0x00" + "000000" + "000001");
    await setCircuit(2, ref(p, 3));
    await setCircuit(1, ref(p, 2));
    await attest(3);
    await attest(2, [3]);
    await attest(1, [2]);

    await setCircuit(3, "0x00" + "000000" + "000002");

    const [allowed, reason] = await check();
    expect(allowed).to.equal(false);
    expect(reason).to.equal("stale");
  });
});
