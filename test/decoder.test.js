const { expect } = require("chai");
const { decodeTapNetlist } = require("./decoder");
const tap02 = require("./fixtures/tap02-vectors.json");

const ref = (cpu, id, nIns, nOuts, ins = []) =>
  "0x02" + cpu.slice(2).padStart(40, "0") +
  BigInt(id).toString(16).padStart(16, "0") +
  nIns.toString(16).padStart(2, "0") +
  nOuts.toString(16).padStart(2, "0") +
  ins.map((x) => x.toString(16).padStart(6, "0")).join("");

describe("TAP-02 structural decoder", function () {
  it("accepts the canonical NAND vector", function () {
    const a = decodeTapNetlist("0x00000002000003", 2, 1);
    expect(a.gateCount).to.equal(1);
    expect(a.depth).to.equal(1);
    expect(a.signals).to.equal(5);
  });

  it("rejects zero outputs and outputs made only from inputs", function () {
    expect(() => decodeTapNetlist("0x00000002000003", 2, 0)).to.throw("nIn/nOut out of range");
    expect(() => decodeTapNetlist("0x", 1, 1)).to.throw("too few signals for outputs");
  });

  it("rejects truncated records and unknown opcodes", function () {
    expect(() => decodeTapNetlist("0x0000000200", 2, 1)).to.throw("truncated record");
    expect(() => decodeTapNetlist("0x03", 0, 1)).to.throw("unknown opcode");
  });

  it("rejects NAND and REF forward references", function () {
    expect(() => decodeTapNetlist("0x00000002000005", 1, 1)).to.throw("not available");
    const r = ref("0x00000000000000000000000000000000000000aa", 1, 1, 1, [2]);
    expect(() => decodeTapNetlist(r, 0, 1)).to.throw("not available");
  });

  it("allows a LATCH D input to point forward, then checks it against final S", function () {
    const feedback = decodeTapNetlist("0x01000002", 0, 1);
    expect(feedback.hasForwardLatch).to.equal(true);
    expect(feedback.depth).to.equal(0);
    expect(() => decodeTapNetlist("0x01000009", 0, 1)).to.throw("LATCH d out of range");
  });

  it("uses previous-beat LATCH output depth zero and measures the D path", function () {
    // NAND signal 2 is available to the LATCH D input. LATCH output itself
    // remains depth zero.
    const nl = "0x0000000000000100000002";
    const a = decodeTapNetlist(nl, 0, 1);
    expect(a.depth).to.equal(1);
  });

  it("preserves REF occurrence records without pretending to know subcircuit depth", function () {
    const cpu = "0x00000000000000000000000000000000000000aa";
    const nl = ref(cpu, 7, 0, 1);
    const a = decodeTapNetlist(nl, 0, 1);
    expect(a.hasRef).to.equal(true);
    expect(a.refCount).to.equal(1);
    expect(a.records[0].id).to.equal(7n);
    expect(a.depth).to.equal(0);
  });

  it("accepts every official TAP-02 valid vector structurally", function () {
    for (const vector of tap02.valid) {
      const decoded = decodeTapNetlist(vector.netlist, vector.nIn, vector.nOut);
      expect(decoded.signals, vector.name).to.be.greaterThan(2 + vector.nIn);
    }
  });

  it("rejects every official TAP-02 structural invalid vector", function () {
    const resolverOnly = new Set(["ref_arity_mismatch", "ref_target_not_registered"]);
    for (const vector of tap02.illFormed) {
      if (resolverOnly.has(vector.name)) continue;
      expect(
        () => decodeTapNetlist(vector.netlist, vector.nIn, vector.nOut),
        vector.name
      ).to.throw();
    }
  });

  it("rejects malformed hex", function () {
    expect(() => decodeTapNetlist("0x0", 0, 1)).to.throw("even-length");
  });
});
