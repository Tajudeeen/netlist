/* Shared Netlist site behavior. No framework, no build step. */
"use strict";

const C = {
  factory: "0x1f09DAeFA827f02CBb40967cc91b259763760761",
  beacon: "0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C",
  opener: "0x536adD8F30f03b69f6fbF29d425A816A0dC50106",
  payments: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
  pinnedImpl: "0x977f217887E085D298Cb3819cDAD5A0ee35F29B2",
};
const S = {
  circuitInfo: "0x084d60f1", netlist: "0x3fc4be56", ownerOf: "0x6352211e",
  isCPU: "0x5f5a364f", isSealed: "0x631f9852", accountOf: "0x0c1905e5",
  isOpened: "0x8b508494", isContainerLive: "0xdcca979e",
  implementation: "0x5c60da1b", cpuAt: "0x4bc7cbbd", cpuCount: "0xa94da8a7",
};

function header(active) {
  const item = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<div class="topbar"><div class="topbar-inner">
    <a class="brand" href="index.html"><span class="mark">N</span>NETLIST</a>
    <span class="chipnet">X Layer · 196</span>
    <nav class="topnav" aria-label="Main navigation">
      ${item("index.html", "Start", "home")}
      ${item("explorer.html", "Explorer", "explorer")}
      ${item("how-it-works.html", "How it works", "how")}
      ${item("gate.html", "Gate status", "gate")}
    </nav>
  </div></div>`;
}

function footer() {
  return `<footer class="site"><div class="footer-inner">
    <div>
      <h4>Netlist</h4>
      <p>A composability pre-flight check for TapeOut circuits. It reads the netlist itself — NAND, LATCH and REF records — instead of trusting a claim about it.</p>
      <p>Built for X Layer TapeOut Accelerate.</p>
    </div>
    <div>
      <h4>Site</h4>
      <ul>
        <li><a href="index.html">Start</a></li>
        <li><a href="explorer.html">Live explorer</a></li>
        <li><a href="how-it-works.html">How it works</a></li>
        <li><a href="gate.html">Gate status</a></li>
      </ul>
    </div>
    <div>
      <h4>Proof &amp; source</h4>
      <ul>
        <li><a href="https://github.com/Tajudeeen/netlist" target="_blank" rel="noopener">Source on GitHub ↗</a></li>
        <li><a href="https://github.com/TapeOutProtocol/TAPs" target="_blank" rel="noopener">TAP-02 / TAP-10 specs ↗</a></li>
        <li><a href="https://www.xlayer.tech/" target="_blank" rel="noopener">X Layer ↗</a></li>
      </ul>
      <p class="muted">All chain reads are plain <code>eth_call</code>. No server, no indexer, no cached state.</p>
    </div>
  </div>
  <div class="footer-bottom">
    <span>Advisory only — a composing contract must choose to call the gate.</span>
    <span>One RPC is one operator's view, not a quorum.</span>
  </div></footer>`;
}

function mount(active) {
  document.getElementById("site-header").innerHTML = header(active);
  document.getElementById("site-footer").innerHTML = footer();
}

/* ---- JSON-RPC helpers (no ethers dependency) ---- */
const pad = (s) => String(s).replace(/^0x/, "").padStart(64, "0");
const num = (n) => pad(BigInt(n).toString(16));
// Public RPCs reset connections / throttle bursts; retry transient failures.
async function rpc(url, method, params) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) {
      last = e;
      if (/ECONNRESET|ETIMEDOUT|429|503|HTTP 5/.test(String(e && e.message))) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw last;
}
async function ethCall(url, to, data, tag = "latest") {
  return rpc(url, "eth_call", [{ to, data }, tag]);
}
const word = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
const asUint = (hex, i) => BigInt("0x" + word(hex, i));
const asBool = (hex, i) => asUint(hex, i) !== 0n;
const asAddr = (hex, i = 0) => "0x" + word(hex, i).slice(-40);
function asBytes(hex) {
  const off = Number(asUint(hex, 0));
  const len = Number(asUint(hex, off / 32));
  const start = 2 + (off / 32 + 1) * 64;
  return "0x" + hex.slice(start, start + len * 2);
}
const short = (a) => (a && a.length > 13 ? a.slice(0, 8) + "…" + a.slice(-6) : a || "—");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Independent TAP-02 decoder — literal port of test/decoder.js. */
function decodeTapNetlist(hex, nIn) {
  const b = Uint8Array.from(hex.replace(/^0x/, "").match(/.{2}/g) || [], (x) => parseInt(x, 16));
  let pos = 0, signals = 2 + nIn, gateCount = 0, depth = 0, refCount = 0;
  let hasForwardLatch = false, hasRef = false;
  const best = new Array(signals).fill(0);
  const need = (n) => { if (b.length - pos < n) throw new Error("truncated netlist record"); };
  const u24 = (p) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
  while (pos < b.length) {
    const op = b[pos++];
    if (op === 0x00) {
      need(6);
      const ai = u24(pos), bi = u24(pos + 3); pos += 6;
      if (ai >= signals || bi >= signals) throw new Error("NAND forward reference");
      const d = Math.max(best[ai], best[bi]) + 1;
      best.push(d); signals++; gateCount++; depth = Math.max(depth, d);
    } else if (op === 0x01) {
      need(3);
      const di = u24(pos); pos += 3;
      if (di >= signals) hasForwardLatch = true;
      const d = (di < best.length ? best[di] : 0) + 1;
      best.push(d); signals++; gateCount++; depth = Math.max(depth, d);
    } else if (op === 0x02) {
      need(30);
      const nIns = b[pos + 28], nOuts = b[pos + 29], insStart = pos + 30;
      need(nIns * 3);
      let parent = 0;
      for (let i = 0; i < nIns; i++) {
        const idx = u24(insStart + i * 3);
        if (idx >= signals) throw new Error("REF forward reference");
        parent = Math.max(parent, best[idx]);
      }
      pos = insStart + nIns * 3;
      const d = parent + 1;
      for (let i = 0; i < nOuts; i++) best.push(d);
      signals += nOuts; hasRef = true; refCount++; depth = Math.max(depth, d);
    } else throw new Error("bad opcode 0x" + op.toString(16));
  }
  return { gateCount, depth, signals, refCount, hasForwardLatch, hasRef };
}

window.Netlist = {
  C, S, mount, rpc, ethCall, asUint, asBool, asAddr, asBytes,
  pad, num, short, esc, decodeTapNetlist,
};
