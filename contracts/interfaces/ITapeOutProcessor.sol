// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITapeOutProcessor
/// @notice Minimal read interface Netlist needs from a TapeOut processor contract.
/// Used only by DirectProcessorAdapter, never by CompositionRegistry or
/// CompositionGate directly, see IProcessorAdapter.sol for why.
///
/// ASSUMPTION / UNVERIFIED, with a more specific history than usual: a real
/// Circuit Netlist Format spec (Circuits.sol / NetlistVM.sol, source verified
/// on BscScan per the spec's own text) was merged into
/// TapeOutProtocol/TAPs as TAP-20 on 2026-10-01, then renumbered TAP-02 on
/// 2026-10-04, with real selectors including isCPU(address) = 0x5f5a364f on
/// the factory, a cited gas model of 2,317 gas per gate, and REF records of
/// 31 + 3*nIns bytes. Re-fetching the live repository directly while writing
/// this build shows neither TAP-02 nor TAP-20 present, only TAP-01 (merged)
/// and TAP-10 (still an unmerged pull request) remain. The spec was
/// confirmed real and then became unavailable in the authoritative source.
/// The signatures below are an informed guess shaped by that since-removed
/// spec, not a transcription of it; do not treat the 2,317 gas/gate figure
/// or the exact function names as confirmed. Re-verify against the live
/// TAPs repository and live chain state before trusting this interface, see
/// scripts/verify.js and README.md.
interface ITapeOutProcessor {
    /// @notice Number of logic gates (NAND/LATCH) wired into a circuit's netlist.
    function gateCount(uint256 tokenId) external view returns (uint32);

    /// @notice Longest combinational path length through the circuit, in gate hops.
    function circuitDepth(uint256 tokenId) external view returns (uint32);

    /// @notice Keccak256 hash of the circuit's current netlist encoding.
    /// @dev Netlist uses this to detect when a circuit changes after attestation.
    function netlistHash(uint256 tokenId) external view returns (bytes32);

    /// @notice Whether this processor's factory-deployed logic is sealed
    /// (no longer upgradeable) per the TAP-01 "sealed" distinction, or still
    /// sitting behind an upgradeable proxy / multi-sig.
    function isSealed() external view returns (bool);

    /// @notice The ERC-6551-style container address bound to a circuit, if opened.
    function containerOf(uint256 tokenId) external view returns (address);

    /// @notice Whether the container's on-chain name/domain is currently activated
    /// (paid), mirroring the isContainerLive-style check TapeKit's kernel performs
    /// for DeWEB sites.
    function isContainerLive(address container) external view returns (bool);

    /// @notice Current holder of a circuit token.
    /// @dev ASSUMPTION: circuits are described publicly as ERC-721 tokens
    /// ("tape out" burns components to mint an immutable Circuit NFT), so this
    /// mirrors the standard ERC-721 ownerOf signature. Confirm against the real
    /// processor contract, circuits may be minted on a separate ERC-721
    /// contract rather than the processor itself, before relying on this for
    /// attestation-ownership enforcement in production.
    function ownerOf(uint256 tokenId) external view returns (address);
}
