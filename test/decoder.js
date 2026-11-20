// Independent JS decoder for the TAP-02 netlist format (§2/§3), used as an
// oracle against the Solidity TapNetlist library. NOT imported by the
// contracts — deliberately a separate implementation so agreement is
// meaningful (test-differential pattern).
function decodeTapNetlist(hex, nIn) {
  const b = Buffer.from(hex.replace(/^0x/, ""), "hex");
  let pos = 0;
  let signals = 2 + nIn;
  let gateCount = 0;
  let depth = 0;
  let refCount = 0;
  let hasForwardLatch = false;
  let hasRef = false;
  const best = new Array(signals).fill(0);

  const need = (n) => {
    if (b.length - pos < n) throw new Error("truncated record");
  };
  const u24 = (p) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];

  while (pos < b.length) {
    const op = b[pos++];
    if (op === 0x00) {
      need(6);
      const ai = u24(pos);
      const bi = u24(pos + 3);
      pos += 6;
      if (ai >= signals || bi >= signals) throw new Error("NAND: future signal");
      const d = Math.max(best[ai], best[bi]) + 1;
      best.push(d);
      signals++;
      gateCount++;
      depth = Math.max(depth, d);
    } else if (op === 0x01) {
      need(3);
      const di = u24(pos);
      pos += 3;
      if (di >= signals) hasForwardLatch = true;
      const parent = di < best.length ? best[di] : 0;
      const d = parent + 1;
      best.push(d);
      signals++;
      gateCount++;
      depth = Math.max(depth, d);
    } else if (op === 0x02) {
      need(30);
      const nIns = b[pos + 28];
      const nOuts = b[pos + 29];
      const insStart = pos + 30;
      need(nIns * 3);
      if (nOuts === 0) throw new Error("REF: no outputs");
      let parent = 0;
      for (let i = 0; i < nIns; i++) {
        const idx = u24(insStart + i * 3);
        if (idx >= signals) throw new Error("REF: future signal");
        parent = Math.max(parent, best[idx]);
      }
      pos = insStart + nIns * 3;
      const d = parent + 1;
      for (let i = 0; i < nOuts; i++) best.push(d);
      signals += nOuts;
      hasRef = true;
      refCount++;
      depth = Math.max(depth, d);
    } else {
      throw new Error("bad opcode");
    }
  }
  return { gateCount, depth, signals, refCount, hasForwardLatch, hasRef };
}

module.exports = { decodeTapNetlist };
