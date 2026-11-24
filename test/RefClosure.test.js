const { expect } = require("chai");
const { parseRefs, resolveClosure } = require("../scripts/ref-closure");
const { loadArtifacts, setupProvider, deploy } = require("./helpers");

// Literal TAP-02 REF record: 0x02 + cpu(20) + id(u64) + nIns=0 + nOuts=1.
const CPU = "0xf044d395c91e77459e6b2155015e14f0dd9b349f";
const REF_ZERO_INS = "0x02" + CPU.slice(2) + "0000000000000066" + "00" + "01";
const NAND = "0x00" + "000000" + "000001";

describe("REF closure parser (TAP-02 §2)", function () {
  it("parses a REF record: cpu, id, nIns, nOuts", function () {
    const refs = parseRefs(REF_ZERO_INS);
    expect(refs).to.have.length(1);
    expect(refs[0].cpu).to.equal(CPU);
    expect(refs[0].id).to.equal(102);
    expect(refs[0].nIns).to.equal(0);
    expect(refs[0].nOuts).to.equal(1);
  });

  it("walks mixed NAND + REF records in order", function () {
    const refs = parseRefs("0x" + NAND.slice(2) + REF_ZERO_INS.slice(2));
    expect(refs).to.have.length(1);
    expect(refs[0].id).to.equal(102);
  });

  it("handles REF inputs (31 + 3*nIns bytes)", function () {
    // nIns=2, nOuts=1, ins = [0, 1]
    const ref =
      "0x02" + CPU.slice(2) + "0000000000000066" + "02" + "01" +
      "000000" + "000001";
    const refs = parseRefs(ref);
    expect(refs).to.have.length(1);
    expect(refs[0].nIns).to.equal(2);
  });

  it("rejects a bad opcode", function () {
    expect(() => parseRefs("0xff")).to.throw(/bad opcode/);
  });
});

describe("REF closure resolver", function () {
  let artifacts, server, provider, signer, processor;

  before(async function () {
    artifacts = loadArtifacts();
    const setup = await setupProvider();
    server = setup.server;
    provider = setup.provider;
    signer = await provider.getSigner(0);
  });

  after(async function () {
    await server.disconnect();
  });

  beforeEach(async function () {
    processor = await deploy(artifacts, "MockProcessorV2", signer);
  });

  it("deduplicates unique circuits but counts repeated REF instances and expanded gates", async function () {
    const cpu = await processor.getAddress();
    const refWithTwoInputs = (id) =>
      "0x02" + cpu.slice(2).toLowerCase() +
      BigInt(id).toString(16).padStart(16, "0") + "02" + "01" +
      "000000" + "000001";

    await (await processor.setCircuit(4, 2, 1, 0, 1, NAND, ethers.ZeroAddress)).wait();
    await (await processor.setCircuit(2, 2, 1, 0, 1, refWithTwoInputs(4), ethers.ZeroAddress)).wait();
    await (await processor.setCircuit(3, 2, 1, 0, 1, refWithTwoInputs(4), ethers.ZeroAddress)).wait();
    const root = refWithTwoInputs(2) + refWithTwoInputs(3).slice(2);
    await (await processor.setCircuit(1, 2, 1, 0, 2, root, ethers.ZeroAddress)).wait();

    const iface = new ethers.Interface([
      "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
      "function netlist(uint256) view returns (bytes)",
    ]);
    const report = await resolveClosure(provider, iface, cpu, 1);
    expect(report.uniqueCircuitCount).to.equal(4);
    expect(report.expandedInstanceCount).to.equal(5);
    expect(report.expandedGateCount).to.equal(2);
    expect(report.expandedStateCount).to.equal(0);
  });
});
