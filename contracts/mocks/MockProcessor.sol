// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITapeOutProcessor} from "../interfaces/ITapeOutProcessor.sol";

/// @title MockProcessor
/// @notice Stand-in for a real TapeOut processor contract, used only for
/// Netlist's own test suite. Lets tests set gate count, depth, netlist hash,
/// seal status, and container liveness directly, since the real processor ABI
/// is unverified (see ITapeOutProcessor notes). Replace with an adapter around
/// the real contract before any testnet/mainnet integration test.
contract MockProcessor is ITapeOutProcessor {
    struct Circuit {
        uint32 gateCount;
        uint32 depth;
        bytes32 netlistHash;
        address container;
        address owner;
    }

    mapping(uint256 => Circuit) private _circuits;
    mapping(address => bool) private _containerLive;
    bool private _sealed;

    function setCircuit(
        uint256 tokenId,
        uint32 gates,
        uint32 depth,
        bytes32 hash,
        address container
    ) external {
        _circuits[tokenId].gateCount = gates;
        _circuits[tokenId].depth = depth;
        _circuits[tokenId].netlistHash = hash;
        _circuits[tokenId].container = container;
    }

    function setOwner(uint256 tokenId, address newOwner) external {
        _circuits[tokenId].owner = newOwner;
    }

    function ownerOf(uint256 tokenId) external view override returns (address) {
        return _circuits[tokenId].owner;
    }

    function setNetlistHash(uint256 tokenId, bytes32 hash) external {
        _circuits[tokenId].netlistHash = hash;
    }

    function setSealed(bool isSealedNow) external {
        _sealed = isSealedNow;
    }

    function setContainerLive(address container, bool live) external {
        _containerLive[container] = live;
    }

    function gateCount(uint256 tokenId) external view override returns (uint32) {
        return _circuits[tokenId].gateCount;
    }

    function circuitDepth(uint256 tokenId) external view override returns (uint32) {
        return _circuits[tokenId].depth;
    }

    function netlistHash(uint256 tokenId) external view override returns (bytes32) {
        return _circuits[tokenId].netlistHash;
    }

    function isSealed() external view override returns (bool) {
        return _sealed;
    }

    function containerOf(uint256 tokenId) external view override returns (address) {
        return _circuits[tokenId].container;
    }

    function isContainerLive(address container) external view override returns (bool) {
        return _containerLive[container];
    }
}
