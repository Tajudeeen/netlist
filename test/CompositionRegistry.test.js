const { expect } = require("chai");
const { ethers } = require("ethers");
const { loadArtifacts, setupProvider, deploy, expectRevert, setupAdapter } = require("./helpers");

describe("CompositionRegistry", function () {
  let artifacts, server, provider, deployer, holder, impostor, auditor;
  let registry, mockProcessor;

  const tokenId = 1;
  const netlistHashA = ethers.keccak256(ethers.toUtf8Bytes("netlist-v1"));
  const netlistHashB = ethers.keccak256(ethers.toUtf8Bytes("netlist-v2"));

  before(async function () {
    artifacts = loadArtifacts();
    const setup = await setupProvider();
    server = setup.server;
    provider = setup.provider;
    [deployer, holder, impostor, auditor] = await Promise.all([
      provider.getSigner(0),
      provider.getSigner(1),
      provider.getSigner(2),
      provider.getSigner(3),
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

    await (
      await mockProcessor.setCircuit(
        tokenId,
        120,
        6,
        netlistHashA,
        await holder.getAddress()
      )
    ).wait();
    await (
      await mockProcessor.setOwner(tokenId, await holder.getAddress())
    ).wait();
  });

  describe("publisher attestations", function () {
    it("rejects an attestation from anyone who isn't the current circuit owner", async function () {
      await expectRevert(
        registry
          .connect(impostor)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            2,
            ethers.ZeroHash,
            1,
            ""
          ),
        "NotCircuitHolder",
        registry
      );
    });

    it("accepts an attestation from the actual circuit owner and versions it", async function () {
      await (
        await registry
          .connect(holder)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            3,
            ethers.keccak256(ethers.toUtf8Bytes("deps-v1")),
            1,
            "tape://4246.0.tape/audit.html"
          )
      ).wait();

      const [a, stale] = await registry.getPublisherAttestation(
        await mockProcessor.getAddress(),
        tokenId
      );
      expect(a.exists).to.equal(true);
      expect(a.attestor).to.equal(await holder.getAddress());
      expect(a.version).to.equal(1n);
      expect(stale).to.equal(false);

      // re-attesting bumps the version rather than silently overwriting
      await (
        await registry
          .connect(holder)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            4,
            ethers.ZeroHash,
            2,
            ""
          )
      ).wait();

      const [a2] = await registry.getPublisherAttestation(
        await mockProcessor.getAddress(),
        tokenId
      );
      expect(a2.version).to.equal(2n);
      expect(a2.declaredDepsCount).to.equal(4n);
    });

    it("flags the attestation stale the moment the netlist changes, and void after ownership moves", async function () {
      await (
        await registry
          .connect(holder)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            1,
            ethers.ZeroHash,
            0,
            ""
          )
      ).wait();

      await (
        await mockProcessor.setNetlistHash(tokenId, netlistHashB)
      ).wait();

      const [a, stale] = await registry.getPublisherAttestation(
        await mockProcessor.getAddress(),
        tokenId
      );
      expect(a.exists).to.equal(true);
      expect(stale).to.equal(true);
    });

    it("enforces the publisher attestation fee when one is set", async function () {
      const adapterRegistry = await setupAdapter(artifacts, deployer, await mockProcessor.getAddress());
      const paid = await deploy(artifacts, "CompositionRegistry", deployer, [
        await adapterRegistry.getAddress(),
        ethers.parseEther("0.001"),
        await deployer.getAddress(),
      ]);

      await expectRevert(
        paid
          .connect(holder)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            0,
            ethers.ZeroHash,
            0,
            ""
          ),
        "InsufficientFee",
        paid
      );

      await (
        await paid
          .connect(holder)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            0,
            ethers.ZeroHash,
            0,
            "",
            { value: ethers.parseEther("0.001") }
          )
      ).wait();
    });
  });

  describe("auditor attestations", function () {
    it("rejects an auditor attestation from an unauthorized address", async function () {
      await expectRevert(
        registry
          .connect(auditor)
          .attestAsAuditor(
            await mockProcessor.getAddress(),
            tokenId,
            1,
            "tape://auditor-report.tape"
          ),
        "NotAuthorizedAuditor",
        registry
      );
    });

    it("accepts an auditor attestation once authorized, kept separate from the publisher's own", async function () {
      await (
        await registry.connect(deployer).setAuditorAuthorized(
          await auditor.getAddress(),
          true
        )
      ).wait();

      // publisher declares Low risk
      await (
        await registry
          .connect(holder)
          .attestAsPublisher(
            await mockProcessor.getAddress(),
            tokenId,
            1,
            ethers.ZeroHash,
            1,
            ""
          )
      ).wait();

      // auditor independently disagrees and flags High risk
      await (
        await registry
          .connect(auditor)
          .attestAsAuditor(
            await mockProcessor.getAddress(),
            tokenId,
            3,
            "tape://auditor-report.tape"
          )
      ).wait();

      const [pub] = await registry.getPublisherAttestation(
        await mockProcessor.getAddress(),
        tokenId
      );
      const [aud] = await registry.getAuditorAttestation(
        await mockProcessor.getAddress(),
        tokenId
      );

      expect(pub.riskTier).to.equal(1n);
      expect(pub.attestor).to.equal(await holder.getAddress());
      expect(aud.riskTier).to.equal(3n);
      expect(aud.attestor).to.equal(await auditor.getAddress());
    });

    it("only the owner can authorize or revoke an auditor", async function () {
      await expectRevert(
        registry
          .connect(impostor)
          .setAuditorAuthorized(await auditor.getAddress(), true),
        "NotOwner",
        registry
      );
    });
  });
});
