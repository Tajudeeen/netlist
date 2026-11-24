const { expect } = require("chai");
const { ethers } = require("ethers");
const { loadArtifacts, setupProvider, deploy, expectRevert, setupAdapter } = require("./helpers");

describe("CompositionGate", function () {
  let artifacts, server, provider, deployer, holder, auditor;
  let registry, gate, mockProcessor;

  const tokenId = 7;
  const netlistHash = ethers.keccak256(ethers.toUtf8Bytes("netlist-v1"));
  const GAS_PER_GATE = 450n;

  before(async function () {
    artifacts = loadArtifacts();
    const setup = await setupProvider();
    server = setup.server;
    provider = setup.provider;
    [deployer, holder, auditor] = await Promise.all([
      provider.getSigner(0),
      provider.getSigner(1),
      provider.getSigner(2),
    ]);
  });

  after(async function () {
    await server.disconnect();
  });

  beforeEach(async function () {
    mockProcessor = await deploy(artifacts, "MockProcessor", deployer);
    const adapterRegistry = await setupAdapter(artifacts, deployer, await mockProcessor.getAddress());
    registry = await deploy(artifacts, "CompositionRegistry", deployer, [
      await adapterRegistry.getAddress(),
      0,
      await deployer.getAddress(),
    ]);
    gate = await deploy(artifacts, "CompositionGate", deployer, [
      await registry.getAddress(),
      await adapterRegistry.getAddress(),
      GAS_PER_GATE,
    ]);

    await (
      await mockProcessor.setCircuit(
        tokenId,
        100, // gateCount -> estimatedGas = 45000
        4,
        netlistHash,
        await holder.getAddress()
      )
    ).wait();
    await (await mockProcessor.setOwner(tokenId, await holder.getAddress())).wait();
    await (await mockProcessor.setSealed(true)).wait();
    await (
      await mockProcessor.setContainerLive(await holder.getAddress(), true)
    ).wait();
  });

  async function attestPublisher(deps = 2, riskTier = 1) {
    await (
      await registry
        .connect(holder)
        .attestAsPublisher(
          await mockProcessor.getAddress(),
          tokenId,
          deps,
          ethers.ZeroHash,
          riskTier,
          ""
        )
    ).wait();
  }

  it("statusReport exposes every layer as its own field, nothing collapsed", async function () {
    const r = await gate.statusReport(await mockProcessor.getAddress(), tokenId);
    expect(r.gateCount).to.equal(100n);
    expect(r.depth).to.equal(4n);
    expect(r.estimatedGas).to.equal(100n * GAS_PER_GATE);
    expect(r.hasPublisherAttestation).to.equal(false);
    expect(r.hasAuditorAttestation).to.equal(false);
    expect(r.processorSealed).to.equal(true);
    expect(r.containerLive).to.equal(true);
  });

  it("denies an unattested circuit under the default policy", async function () {
    const policy = Array.from(await gate.defaultPolicy());
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("no-attestation");
  });

  it("allows a sealed, attested, live-container circuit under the default policy", async function () {
    await attestPublisher();
    const policy = Array.from(await gate.defaultPolicy());
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(true);
    expect(reason).to.equal("");
  });

  it("requireCallAllowed reverts with CallNotAllowed(reason) instead of returning false", async function () {
    const policy = Array.from(await gate.defaultPolicy());
    await expectRevert(
      gate.requireCallAllowed(await mockProcessor.getAddress(), tokenId, policy),
      "CallNotAllowed",
      gate
    );

    await attestPublisher();
    await (
      await gate.requireCallAllowed(
        await mockProcessor.getAddress(),
        tokenId,
        policy
      )
    ); // view call, should not throw now
  });

  it("denies when the processor is unsealed and policy requires sealed", async function () {
    await attestPublisher();
    await (await mockProcessor.setSealed(false)).wait();

    const policy = Array.from(await gate.defaultPolicy());
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("unsealed");
  });

  it("denies a stale attestation when the policy rejects staleness", async function () {
    await attestPublisher();
    await (
      await mockProcessor.setNetlistHash(
        tokenId,
        ethers.keccak256(ethers.toUtf8Bytes("netlist-v2"))
      )
    ).wait();

    const policy = Array.from(await gate.defaultPolicy());
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("stale");
  });

  it("refuses to enforce a dependency ceiling from publisher-declared metadata alone", async function () {
    await attestPublisher(10, 1);

    const policy = [0, 3, 2, true, true, true, true, false];
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("deps-unverified");
  });

  it("denies when estimatedGas exceeds the policy limit", async function () {
    await attestPublisher(1, 0);

    const policy = [10000, 0, 3, true, true, true, true, false];
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("gas-estimate");
  });

  it("denies when publisher risk tier exceeds the caller's tolerance", async function () {
    await attestPublisher(1, 3); // High

    const policy = [0, 0, 1, true, true, true, true, false]; // caller tolerates up to Low
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("risk-tier");
  });

  it("denies when the target container is not live and policy requires it", async function () {
    await attestPublisher();
    await (
      await mockProcessor.setContainerLive(await holder.getAddress(), false)
    ).wait();

    const policy = Array.from(await gate.defaultPolicy());
    const [allowed, reason] = await gate.checkCall(
      await mockProcessor.getAddress(),
      tokenId,
      policy
    );
    expect(allowed).to.equal(false);
    expect(reason).to.equal("container-dead");
  });

  describe("auditor-review policy", function () {
    it("denies when policy requires auditor review and none exists", async function () {
      await attestPublisher();

      const policy = [0, 0, 3, true, true, true, true, true]; // requireAuditorReview = true
      const [allowed, reason] = await gate.checkCall(
        await mockProcessor.getAddress(),
        tokenId,
        policy
      );
      expect(allowed).to.equal(false);
      expect(reason).to.equal("no-audit");
    });

    it("allows once both a publisher attestation and an auditor review exist", async function () {
      await attestPublisher();
      await (
        await registry.connect(deployer).setAuditorAuthorized(
          await auditor.getAddress(),
          true
        )
      ).wait();
      await (
        await registry
          .connect(auditor)
          .attestAsAuditor(
            await mockProcessor.getAddress(),
            tokenId,
            1,
            "tape://audit.tape"
          )
      ).wait();

      const policy = [0, 0, 3, true, true, true, true, true];
      const [allowed, reason] = await gate.checkCall(
        await mockProcessor.getAddress(),
        tokenId,
        policy
      );
      expect(allowed).to.equal(true);
      expect(reason).to.equal("");
    });
  });
});
