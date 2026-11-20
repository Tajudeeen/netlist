// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TAP-02 REF target extractor
/// @notice Parses a TAP-02 netlist and returns every REF record's target
/// (processor contract, circuit id). This is the basis for automatic
/// dependency discovery: the netlist itself names what a circuit composes,
/// so declared dependencies can become a consistency check rather than the
/// only source of truth.
///
/// REF record layout (TAP-02 §2):
///   0x02 | cpu:20 bytes | id:u64 | nIns:u8 | nOuts:u8 | ins:u24 × nIns
///   total 31 + 3*nIns bytes.
///
/// Bounded and allocation-safe: pass 1 counts REF records and validates all
/// record lengths, pass 2 fills an exactly-sized array (TAP-02 §7 req 2).
library TapRefs {
    uint8 internal constant OP_NAND = 0x00;
    uint8 internal constant OP_LATCH = 0x01;
    uint8 internal constant OP_REF = 0x02;

    error MalformedNetlist(string reason);

    struct Target {
        address processor;
        uint256 id;
    }

    function targets(bytes memory b) internal pure returns (Target[] memory out) {
        uint256 len = b.length;
        uint256 count = 0;
        uint256 pos = 0;

        // ---- pass 1: validate and count ----
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                _need(len, pos, 6);
                pos += 6;
            } else if (op == OP_LATCH) {
                _need(len, pos, 3);
                pos += 3;
            } else if (op == OP_REF) {
                _need(len, pos, 30);
                uint256 nIns = uint8(b[pos + 28]);
                pos += 30;
                _need(len, pos, nIns * 3);
                pos += nIns * 3;
                count++;
            } else {
                revert MalformedNetlist("bad opcode");
            }
        }

        out = new Target[](count);
        pos = 0;
        uint256 i = 0;
        // ---- pass 2: fill ----
        while (pos < len) {
            uint8 op = uint8(b[pos++]);
            if (op == OP_NAND) {
                pos += 6;
            } else if (op == OP_LATCH) {
                pos += 3;
            } else {
                out[i].processor = _addressAt(b, pos);
                out[i].id = _u64(b, pos + 20);
                uint256 nIns = uint8(b[pos + 28]);
                pos += 30 + nIns * 3;
                i++;
            }
        }
    }

    function _need(uint256 len, uint256 pos, uint256 n) private pure {
        if (len - pos < n) revert MalformedNetlist("truncated record");
    }

    function _addressAt(bytes memory b, uint256 p) private pure returns (address) {
        uint160 v;
        for (uint256 i = 0; i < 20; i++) {
            v = (v << 8) | uint160(uint8(b[p + i]));
        }
        return address(v);
    }

    function _u64(bytes memory b, uint256 p) private pure returns (uint256) {
        uint256 v;
        for (uint256 i = 0; i < 8; i++) {
            v = (v << 8) | uint256(uint8(b[p + i]));
        }
        return v;
    }
}
