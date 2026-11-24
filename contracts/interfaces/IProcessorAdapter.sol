// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IProcessorAdapter
/// @notice The ONLY place in this codebase that encodes assumptions about a
/// real TapeOut processor's ABI. Every call takes the processor address
/// explicitly, so one adapter contract can serve many processors, or a
/// different adapter can be deployed and swapped in per processor once its
/// real interface is confirmed, without touching CompositionRegistry or
/// CompositionGate at all.
///
/// The adapter implementation is pinned to the deployed processor factory,
/// beacon and circuit implementation. TAP-02 defines the netlist read ABI,
/// while TAP-10 supplies deployment and upgrade-trust requirements. The
/// X Layer implementation must still be independently compared with the
/// normative TAP-02 reference before a full conformance claim is made.
interface IProcessorAdapter {
    function trustIdentity(address processor) external view returns (bytes32);
    function gateCount(address processor, uint256 tokenId) external view returns (uint32);
    function circuitDepth(address processor, uint256 tokenId) external view returns (uint32);
    function netlistHash(address processor, uint256 tokenId) external view returns (bytes32);
    function isSealed(address processor) external view returns (bool);
    function containerOf(address processor, uint256 tokenId) external view returns (address);
    function isContainerLive(address processor, address container) external view returns (bool);
    function ownerOf(address processor, uint256 tokenId) external view returns (address);
}
