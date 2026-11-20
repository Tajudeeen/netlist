const { expect } = require("chai");
const { parseRefs } = require("../scripts/ref-closure");

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
  // Live-network tests live in scripts/verify-ref.js (npm run verify:refs)
  // so `npm test` stays fully offline. The unit tests above cover parsing;
  // verify-ref.js proves the resolver against real X Layer circuits.
});
