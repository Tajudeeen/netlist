// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TAP-02 netlist decoder (on-chain, bounded, single pass per stage)
/// @notice Parses the literal TAP-02 byte format (§2) in two bounded passes:
///   1. validate every record and count total signals / gates / refs;
///   2. allocate an exact-size depth array and compute longest paths.
///
/// Decoders parse untrusted bytes: every read checks remaining length before
/// advancing, and nothing is allocated in proportion to an unvalidated count
/// (TAP-02 §7 requirement 2). The bytes come straight from the processor's
/// `netlist(id)` — nothing here is publisher self-reported.
///
/// Signal numbering (§2): 0 = const 0, 1 = const 1, 2..2+nIn-1 = inputs,
/// then one signal per NAND/LATCH record and nOuts signals per REF record.
/// NAND/REF operands must point backwards; LATCH `d` may point forward
/// (§3 condition 5 — that is how feedback is built).
library TapNetlist {
    uint8 internal constant OP_NAND = 0x00;
    uint8 internal constant OP_LATCH = 0x01;
    uint8 internal constant OP_REF = 0x02;

    // §3 cond 7/8: S <= 2^24, gateCount <= 2^32-1. Keep depth well below
    // uint32 max so a hostile netlist cannot wrap the counter.
    uint32 internal constant MAX_DEPTH = 1_000_000;
    uint256 internal constant MAX_SIGNALS = 0x00ffffff;

    error MalformedNetlist(string reason);
    error NetlistTooLarge();

    struct Analysis {
        uint32 gateCount; // top-level NAND + LATCH records
        uint32 depth; // longest combinational path in gate hops
        uint32 signals; // S from §3
        uint16 refCount; // REF records in this netlist
        bool hasForwardLatch; // a LATCH whose d points forward (feedback)
        bool hasRef; // true when the circuit composes other circuits
    }

    struct RefInfo {
        uint256 nextPos;
        uint256 insStart;
        uint256 nIns;
        uint256 nOuts;
    }

    /// @notice Decode and analyse a TAP-02 netlist.
    /// @param b raw `netlist(id)` bytes.
    /// @param nIn `nIn` from `circuitInfo(id)`.
    function analyze(bytes memory b, uint32 nIn) internal pure returns (Analysis memory a) {
        uint256 len = b.length;
        uint256 signals = 2 + uint256(nIn);

        // ---- Pass 1: validate structure, count signals/gates/refs ----
        uint256 pos = 0;
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                _need(len, pos, 6);
                uint256 ai = _u24(b, pos);
                uint256 bi = _u24(b, pos + 3);
                pos += 6;
                if (ai >= signals || bi >= signals) revert MalformedNetlist("NAND: future signal");
                signals++;
                a.gateCount++;
            } else if (op == OP_LATCH) {
                _need(len, pos, 3);
                uint256 di = _u24(b, pos);
                pos += 3;
                if (di > MAX_SIGNALS) revert MalformedNetlist("LATCH d out of range");
                if (di >= signals) a.hasForwardLatch = true;
                signals++;
                a.gateCount++;
            } else if (op == OP_REF) {
                RefInfo memory r = _readRef(b, len, pos, signals);
                pos = r.nextPos;
                signals += r.nOuts;
                a.hasRef = true;
                a.refCount++;
            } else {
                revert MalformedNetlist("bad opcode");
            }
            if (signals > MAX_SIGNALS) revert NetlistTooLarge();
        }
        a.signals = uint32(signals);

        // ---- Pass 2: longest path per signal, exact allocation ----
        uint32[] memory best = new uint32[](signals);
        pos = 0;
        uint256 sig = 2 + uint256(nIn);
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                uint32 d = _max(best[_u24(b, pos)], best[_u24(b, pos + 3)]) + 1;
                if (d > MAX_DEPTH) revert NetlistTooLarge();
                best[sig] = d;
                if (d > a.depth) a.depth = d;
                pos += 6;
                sig++;
            } else if (op == OP_LATCH) {
                uint256 di = _u24(b, pos);
                uint32 parent = di < sig ? best[di] : 0; // forward d = feedback
                uint32 d = parent + 1;
                best[sig] = d;
                if (d > a.depth) a.depth = d;
                pos += 3;
                sig++;
            } else {
                RefInfo memory r = _readRef(b, len, pos, sig);
                uint32 parent = 0;
                for (uint256 i = 0; i < r.nIns; i++) {
                    uint32 pd = best[_u24(b, r.insStart + i * 3)];
                    if (pd > parent) parent = pd;
                }
                uint32 d = parent + 1; // conservative: REF internals not decoded
                if (d > a.depth) a.depth = d;
                for (uint256 i = 0; i < r.nOuts; i++) best[sig + i] = d;
                pos = r.nextPos;
                sig += r.nOuts;
            }
        }
    }

    /// @dev Validates a REF record (both passes) without allocating by count.
    function _readRef(
        bytes memory b,
        uint256 len,
        uint256 pos,
        uint256 signals
    ) private pure returns (RefInfo memory r) {
        _need(len, pos, 30);
        r.nIns = uint8(b[pos + 28]);
        r.nOuts = uint8(b[pos + 29]);
        r.insStart = pos + 30;
        _need(len, r.insStart, r.nIns * 3);
        if (r.nOuts == 0) revert MalformedNetlist("REF: no outputs");
        for (uint256 i = 0; i < r.nIns; i++) {
            if (_u24(b, r.insStart + i * 3) >= signals) revert MalformedNetlist("REF: future signal");
        }
        r.nextPos = r.insStart + r.nIns * 3;
    }

    function _need(uint256 len, uint256 pos, uint256 n) private pure {
        if (len - pos < n) revert MalformedNetlist("truncated record");
    }

    function _u24(bytes memory b, uint256 p) private pure returns (uint256) {
        return (uint256(uint8(b[p])) << 16) | (uint256(uint8(b[p + 1])) << 8) | uint256(uint8(b[p + 2]));
    }

    function _max(uint32 x, uint32 y) private pure returns (uint32) {
        return x > y ? x : y;
    }
}
