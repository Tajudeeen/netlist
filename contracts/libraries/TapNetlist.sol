// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TAP-02 netlist structural decoder
/// @notice Bounded parser for TAP-02 §2/§3. REF target existence, processor
/// registration, arity and recursive size are checked by the dependency
/// resolver because they require external circuit reads.
library TapNetlist {
    uint8 internal constant OP_NAND = 0x00;
    uint8 internal constant OP_LATCH = 0x01;
    uint8 internal constant OP_REF = 0x02;

    uint32 internal constant MAX_DEPTH = 1_000_000;
    uint256 internal constant MAX_SIGNALS = 1 << 24;
    uint32 internal constant MAX_PINS = 1 << 16;

    error MalformedNetlist(string reason);
    error NetlistTooLarge();

    struct Analysis {
        uint32 gateCount; // top-level NAND + LATCH records only
        uint32 depth; // local combinational / latch-D critical path; REF internals excluded
        uint32 signals;
        uint16 refCount;
        bool hasForwardLatch;
        bool hasRef;
    }

    struct RefInfo {
        uint256 nextPos;
        uint256 insStart;
        uint256 nIns;
        uint256 nOuts;
    }

    /// @notice Backwards-compatible structural check when output count is unknown.
    /// @dev New call sites SHOULD use analyze(b, nIn, nOut) to enforce §3 condition 3.
    function analyze(bytes memory b, uint32 nIn) internal pure returns (Analysis memory a) {
        return analyze(b, nIn, 1);
    }

    /// @notice Decode and structurally validate a TAP-02 netlist.
    function analyze(bytes memory b, uint32 nIn, uint32 nOut) internal pure returns (Analysis memory a) {
        if (nIn > MAX_PINS || nOut == 0 || nOut > MAX_PINS) {
            revert MalformedNetlist("nIn/nOut out of range");
        }

        uint256 len = b.length;
        uint256 signals = 2 + uint256(nIn);
        uint256 pos;

        // Pass 1: validate complete records and count the final signal space.
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                _need(len, pos, 6);
                uint256 ai = _u24(b, pos);
                uint256 bi = _u24(b, pos + 3);
                pos += 6;
                if (ai >= signals || bi >= signals) {
                    revert MalformedNetlist("NAND: future signal");
                }
                signals++;
                a.gateCount++;
            } else if (op == OP_LATCH) {
                _need(len, pos, 3);
                uint256 di = _u24(b, pos);
                pos += 3;
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

        if (signals - (2 + uint256(nIn)) < nOut) {
            revert MalformedNetlist("too few signals for outputs");
        }
        a.signals = uint32(signals);

        // LATCH D may point forward, but must still be inside final S.
        pos = 0;
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                pos += 6;
            } else if (op == OP_LATCH) {
                uint256 di = _u24(b, pos);
                if (di >= signals) revert MalformedNetlist("LATCH d out of range");
                pos += 3;
            } else {
                RefInfo memory r = _readRef(b, len, pos, 0); // REF inputs were validated in pass 1
                pos = r.nextPos;
            }
        }

        // Pass 2: local signal depths. A LATCH output is the previous-beat
        // state bit, so its current-beat depth is zero. REF internals are
        // intentionally not guessed here and are resolved separately.
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
                best[sig] = 0;
                pos += 3;
                sig++;
            } else {
                RefInfo memory r = _readRef(b, len, pos, sig);
                for (uint256 i = 0; i < r.nOuts; i++) best[sig + i] = 0;
                pos = r.nextPos;
                sig += r.nOuts;
            }
        }

        // Pass 3: latch D paths can point forward, so inspect them after all
        // combinational outputs have their local depths.
        pos = 0;
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                pos += 6;
            } else if (op == OP_LATCH) {
                uint32 d = best[_u24(b, pos)];
                if (d > a.depth) a.depth = d;
                pos += 3;
            } else {
                RefInfo memory r = _readRef(b, len, pos, 0);
                pos = r.nextPos;
            }
        }
    }

    function _readRef(bytes memory b, uint256 len, uint256 pos, uint256 signals)
        private pure returns (RefInfo memory r)
    {
        _need(len, pos, 30);
        r.nIns = uint8(b[pos + 28]);
        r.nOuts = uint8(b[pos + 29]);
        r.insStart = pos + 30;
        _need(len, r.insStart, r.nIns * 3);
        if (r.nOuts == 0) revert MalformedNetlist("REF: no outputs");
        for (uint256 i = 0; i < r.nIns; i++) {
            if (_u24(b, r.insStart + i * 3) >= signals) {
                revert MalformedNetlist("REF: future signal");
            }
        }
        r.nextPos = r.insStart + r.nIns * 3;
    }

    function _need(uint256 len, uint256 pos, uint256 n) private pure {
        if (pos > len || len - pos < n) revert MalformedNetlist("truncated record");
    }

    function _u24(bytes memory b, uint256 p) private pure returns (uint256) {
        return (uint256(uint8(b[p])) << 16) |
            (uint256(uint8(b[p + 1])) << 8) |
            uint256(uint8(b[p + 2]));
    }

    function _max(uint32 x, uint32 y) private pure returns (uint32) {
        return x > y ? x : y;
    }
}
