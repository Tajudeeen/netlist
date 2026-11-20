// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Real TapeOut protocol interfaces (TAP-02 / TAP-10)
/// @notice Transcribed from the LIVE TapeOutProtocol/TAPs repository, not
/// guessed. Verified 2026-11-20:
///   TAP-02: https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-02.md
///   TAP-10: https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-10.md
///
/// Selectors were independently confirmed by live eth_call on X Layer (196).
/// These interfaces are deliberately separate from ITapeOutProcessor.sol,
/// which is the project's original provisional guess and is retained for the
/// MockProcessor / DirectProcessorAdapter path so existing tests keep working.

/// @notice The read surface every real TapeOut processor contract exposes.
/// TAP-02 §6: circuit ids start at 1 within each processor.
interface ITapeOutProcessorV2 {
    /// @notice TAP-02 selector 0x084d60f1.
    /// @return nIn input count, nOut output count, nState state bits,
    /// gateCount NAND+LATCH count INCLUDING gates reached through REF.
    function circuitInfo(
        uint256 id
    ) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);

    /// @notice TAP-02 selector 0x3fc4be56. The literal on-chain netlist bytes.
    function netlist(uint256 id) external view returns (bytes memory);

    /// @notice Standard ERC-721 ownership of the circuit NFT.
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice TAP-02 §6 / TAP-10 appendix: the processor factory.
interface IProcessorFactoryV2 {
    /// @notice TAP-02 selector 0x5f5a364f; true iff `cpu` is a registered processor.
    function isCPU(address cpu) external view returns (bool);

    /// @notice TAP-10 seal definition: 1 only when the factory can no longer
    /// change the circuit implementation behind its beacon.
    function isSealed() external view returns (bool);

    function cpuCount() external view returns (uint256);

    function cpuAt(uint256 i) external view returns (address);
}

/// @notice ERC-1967 beacon behind each processor proxy (TAP-10 Deployments).
interface IUpgradeableBeacon {
    function implementation() external view returns (address);

    function owner() external view returns (address);
}

/// @notice TAP-10 §6: deterministic ERC-6551 container derivation.
interface IContainerOpener {
    function accountOf(address circuits, uint256 tokenId) external view returns (address);

    function isOpened(address circuits, uint256 tokenId) external view returns (bool);
}

/// @notice TAP-10 §6.3: container activation (a paid name or domain).
interface IDomainBinding {
    /// @notice TAP-10 says a reverting call MUST be treated as false. The
    /// adapter implements that rule in its try/catch.
    function isContainerLive(address container) external view returns (bool);
}
