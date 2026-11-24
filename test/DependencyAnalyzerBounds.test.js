const { expect } = require("chai");
const { loadArtifacts, setupProvider, deploy, setupAdapter } = require("./helpers");

function ref(processor, id) {
  return "02" + processor.slice(2).toLowerCase() +
    BigInt(id).toString(16).padStart(16, "0") + "02" + "01" +
    "000000" + "000001";
}

describe("DependencyAnalyzer — expanded-instance ceiling", function () {
  let artifacts, server, provider, deployer, holder;
  let processor, adapterRegistry, reader, analyzer;

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
    adapterRegistry = await setupAdapter(artifacts, deployer, await processor.getAddress());
    reader = await deploy(artifacts, "MockNetlistReader", deployer);
    analyzer = await deploy(artifacts, "DependencyAnalyzer", deployer, [
      await adapterRegistry.getAddress(),
      await reader.getAddress(),
    ]);
  });

  it("measures the full 512-instance boundary with a repeated REF subtree", async function () {
    const p = await processor.getAddress();
    const leaf = "0x00" + "000000" + "000001";
    await (await processor.setCircuit(
      2, 2, 1, 0, 1, leaf, await holder.getAddress()
    )).wait();

    const refs = Array.from({ length: 511 }, () => ref(p, 2)).join("");
    await (await processor.setCircuit(
      1, 2, 1, 0, 511, "0x" + refs, await holder.getAddress()
    )).wait();

    const gas = await analyzer.analyze.estimateGas(p, 1, 32, 2);
    const report = await analyzer.analyze(p, 1, 32, 2);
    console.log("DependencyAnalyzer 512-instance estimate:", gas.toString());

    expect(Number(report.totalCircuits)).to.equal(2);
    expect(Number(report.depCount)).to.equal(1);
    expect(Number(report.expandedInstances)).to.equal(512);
    expect(report.truncated).to.equal(false);
    expect(report.complete).to.equal(true);
  });

  it("fails closed when one more REF occurrence exceeds the 512-instance ceiling", async function () {
    const p = await processor.getAddress();
    const leaf = "0x00" + "000000" + "000001";
    await (await processor.setCircuit(
      2, 2, 1, 0, 1, leaf, await holder.getAddress()
    )).wait();

    const refs = Array.from({ length: 512 }, () => ref(p, 2)).join("");
    await (await processor.setCircuit(
      1, 2, 1, 0, 512, "0x" + refs, await holder.getAddress()
    )).wait();

    const report = await analyzer.analyze(p, 1, 32, 2);
    expect(Number(report.expandedInstances)).to.equal(512);
    expect(report.truncated).to.equal(true);
    expect(report.complete).to.equal(false);
  });
});
