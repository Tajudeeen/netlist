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
/// Why this exists: a Circuit Netlist Format spec (merged as TAP-20, then
/// renumbered TAP-02 in TapeOutProtocol/TAPs, Oct 1-4 2026) once documented
/// real selectors for exactly this data. As of this build, re-fetching the
/// live repository directly shows that spec is no longer present, only
/// TAP-01 and an unmerged TAP-10 remain. The ABI is not just unconfirmed, it
/// was briefly confirmed and then removed. Treat any assumption here as
/// provisional, and re-verify against the live repository and live chain
/// state before trusting an adapter built on it. See README.md's
/// verifiability section and scripts/verify.js.
interface IProcessorAdapter {
    function gateCount(address processor, uint256 tokenId) external view returns (uint32);
    function circuitDepth(address processor, uint256 tokenId) external view returns (uint32);
    function netlistHash(address processor, uint256 tokenId) external view returns (bytes32);
    function isSealed(address processor) external view returns (bool);
    function containerOf(address processor, uint256 tokenId) external view returns (address);
    function isContainerLive(address processor, address container) external view returns (bool);
    function ownerOf(address processor, uint256 tokenId) external view returns (address);
}
