const { expect } = require("chai");
const { loadArtifacts, setupProvider, deploy, expectRevert } = require("./helpers");

describe("ProcessorAdapterRegistry", function () {
  let artifacts, server, provider, owner, processor, adapter, registry;

  before(async function () {
    artifacts = loadArtifacts();
    const setup = await setupProvider();
    server = setup.server;
    provider = setup.provider;
    owner = await provider.getSigner(0);
  });

  after(async function () {
    await server.disconnect();
  });

  beforeEach(async function () {
    processor = await deploy(artifacts, "MockProcessor", owner);
    adapter = await deploy(artifacts, "DirectProcessorAdapter", owner);
    registry = await deploy(artifacts, "ProcessorAdapterRegistry", owner);
  });

  it("resolves a default adapter for any processor and preserves per-processor overrides", async function () {
    await (await registry.setDefaultAdapter(await adapter.getAddress())).wait();
    expect((await registry.adapterFor(await processor.getAddress())).toLowerCase())
      .to.equal((await adapter.getAddress()).toLowerCase());
    expect(await registry.hasAdapter("0x0000000000000000000000000000000000001234")).to.equal(true);
  });

  it("still fails closed when neither a specific nor default adapter exists", async function () {
    await expectRevert(
      registry.adapterFor(await processor.getAddress()),
      "NoAdapterConfigured",
      registry
    );
  });
});
