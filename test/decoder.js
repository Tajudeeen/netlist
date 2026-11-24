// Independent structural decoder for TAP-02 §2/§3.
// This intentionally does not resolve REF targets. Callers that need full
// conformance must resolve each REF and validate target registration,
// existence, arity, recursive state and expanded gate limits separately.

const MAX_SIGNALS = 1 << 24;
const MAX_PINS = 1 << 16;

function decodeTapNetlist(hex, nIn, nOut = 1) {
  if (!Number.isInteger(nIn) || nIn < 0 || nIn > MAX_PINS) {
    throw new Error("nIn/nOut out of range");
  }
  if (!Number.isInteger(nOut) || nOut < 1 || nOut > MAX_PINS) {
    throw new Error("nIn/nOut out of range");
  }
  if (typeof hex !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error("netlist must be even-length 0x-prefixed hex");
  }

  const b = Buffer.from(hex.slice(2), "hex");
  let pos = 0;
  let signals = 2 + nIn;
  let gateCount = 0;
  let refCount = 0;
  let hasForwardLatch = false;
  let hasRef = false;
  const records = [];

  const need = (n) => {
    if (b.length - pos < n) throw new Error(`truncated record at byte ${pos}`);
  };
  const u24 = (p) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];

  while (pos < b.length) {
    const recordOffset = pos;
    const op = b[pos++];
    const firstOut = signals;
    if (op === 0x00) {
      need(6);
      const a = u24(pos);
      const c = u24(pos + 3);
      pos += 6;
      if (a >= firstOut || c >= firstOut) {
        throw new Error(`signal referenced by element at ${firstOut} is not available`);
      }
      records.push({ op, firstOut, inputs: [a, c], nOut: 1, offset: recordOffset });
      signals += 1;
      gateCount += 1;
    } else if (op === 0x01) {
      need(3);
      const d = u24(pos);
      pos += 3;
      records.push({ op, firstOut, inputs: [d], nOut: 1, offset: recordOffset });
      if (d >= signals) hasForwardLatch = true;
      signals += 1;
      gateCount += 1;
    } else if (op === 0x02) {
      need(30);
      const cpu = "0x" + b.subarray(pos, pos + 20).toString("hex");
      const id = b.readBigUInt64BE(pos + 20);
      const nIns = b[pos + 28];
      const nOuts = b[pos + 29];
      const insStart = pos + 30;
      need(30 + nIns * 3 - (pos - recordOffset - 1));
      if (nOuts === 0) throw new Error("REF: no outputs");
      const inputs = [];
      for (let i = 0; i < nIns; i++) {
        const idx = u24(insStart + i * 3);
        if (idx >= firstOut) {
          throw new Error(`signal referenced by element at ${firstOut} is not available`);
        }
        inputs.push(idx);
      }
      pos = insStart + nIns * 3;
      records.push({ op, firstOut, inputs, nOut: nOuts, cpu, id, offset: recordOffset });
      signals += nOuts;
      hasRef = true;
      refCount += 1;
    } else {
      throw new Error(`unknown opcode 0x${op.toString(16).padStart(2, "0")} at byte ${recordOffset}`);
    }
    if (signals > MAX_SIGNALS) throw new Error("more than 2^24 signals");
  }

  if (signals - 2 - nIn < nOut) throw new Error("too few signals for outputs");

  // NAND and REF outputs are available in record order. LATCH outputs are
  // previous-beat state and therefore have depth zero. Their D input is a
  // next-state path and can legally point forward, so evaluate those paths
  // after all combinational signal depths have been populated.
  const best = new Array(signals).fill(0);
  let depth = 0;
  for (const r of records) {
    if (r.op === 0x00) {
      const d = Math.max(best[r.inputs[0]], best[r.inputs[1]]) + 1;
      best[r.firstOut] = d;
      depth = Math.max(depth, d);
    } else if (r.op === 0x01) {
      best[r.firstOut] = 0;
    } else {
      // The referenced circuit's internal depth is not knowable without a
      // resolver. Do not invent a one-level estimate for it.
      for (let i = 0; i < r.nOut; i++) best[r.firstOut + i] = 0;
    }
  }
  for (const r of records) {
    if (r.op === 0x01) depth = Math.max(depth, best[r.inputs[0]]);
  }

  return {
    gateCount,
    depth,
    signals,
    refCount,
    hasForwardLatch,
    hasRef,
    records,
    nIn,
    nOut,
  };
}

module.exports = { decodeTapNetlist };
