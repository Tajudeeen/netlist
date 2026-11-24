// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProcessorAdapter} from "../interfaces/IProcessorAdapter.sol";
import {
    ITapeOutProcessorV2,
    IProcessorFactoryV2,
    IUpgradeableBeacon,
    IContainerOpener,
    IDomainBinding
} from "../interfaces/ITapeOutV2.sol";
import {TapNetlist} from "../libraries/TapNetlist.sol";

/// @title TapeOutV2Adapter
/// @notice A REAL adapter for the TapeOut contracts actually deployed on X
/// Layer (196) and Base (8453). Implements the existing IProcessorAdapter
/// unchanged, so CompositionRegistry / CompositionGate / all policies work
/// against real circuits with zero changes to the core contracts.
///
/// Verified against live X Layer state on 2026-11-20:
///   factory      0x1f09DAeFA827f02CBb40967cc91b259763760761 (436 processors)
///   beacon       0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C
///   circuit impl 0x977f217887E085D298Cb3819cDAD5A0ee35F29B2
///   opener       0x536adD8F30f03b69f6fbF29d425A816A0dC50106
///   payments     0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9
/// (TAP-02 Deployments + TAP-10 Deployments, re-read via eth_getCode/eth_call.)
///
/// FAIL CLOSED:
///  - a processor the factory does not recognise reverts `NotTapeOutProcessor`;
///  - an ill-formed netlist reverts (it is never presented as a cheap circuit);
///  - REF circuits are flagged by depthIsBounded(), never silently reported
///    as having a complete depth bound;
///  - factory seal requires the beacon to still point at the pinned
///    implementation and be owned by the factory (TAP-10 §13.8), so an
///    upgrade away from the reviewed code is reported as unsealed.
/// The adapter is stateless (all config immutable): to re-pin after an
/// audited upgrade, deploy a new adapter and call setAdapter() on the
/// ProcessorAdapterRegistry — no core contract changes required.
contract TapeOutV2Adapter is IProcessorAdapter {
    using TapNetlist for bytes;

    IProcessorFactoryV2 public immutable factory;
    IUpgradeableBeacon public immutable beacon;
    IContainerOpener public immutable opener;
    IDomainBinding public immutable payments;

    /// @notice The circuit implementation this adapter was reviewed against.
    address public immutable pinnedCircuitImplementation;

    error ZeroAddress();
    error NotTapeOutProcessor(address processor);
    error GateCountMismatch(uint32 decoded, uint32 reported);

    constructor(
        address factory_,
        address beacon_,
        address opener_,
        address payments_,
        address pinnedCircuitImplementation_
    ) {
        if (
            factory_ == address(0) ||
            beacon_ == address(0) ||
            opener_ == address(0) ||
            payments_ == address(0) ||
            pinnedCircuitImplementation_ == address(0)
        ) revert ZeroAddress();
        factory = IProcessorFactoryV2(factory_);
        beacon = IUpgradeableBeacon(beacon_);
        opener = IContainerOpener(opener_);
        payments = IDomainBinding(payments_);
        pinnedCircuitImplementation = pinnedCircuitImplementation_;
    }

    modifier onlyTapeOutProcessor(address processor) {
        if (!factory.isCPU(processor)) revert NotTapeOutProcessor(processor);
        _;
    }

    function _processor(address processor) private pure returns (ITapeOutProcessorV2) {
        return ITapeOutProcessorV2(processor);
    }

    function _analyze(address processor, uint256 tokenId) private view returns (TapNetlist.Analysis memory) {
        ITapeOutProcessorV2 p = _processor(processor);
        (uint32 nIn, uint32 nOut, , ) = p.circuitInfo(tokenId);
        return p.netlist(tokenId).analyze(nIn, nOut);
    }

    /// @notice Top-level NAND+LATCH count decoded from the real netlist bytes.
    function gateCount(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (uint32) {
        return _analyze(processor, tokenId).gateCount;
    }

    /// @notice Longest path through the TOP-LEVEL records only. See
    /// depthIsBounded() — a REF circuit's true depth may be deeper.
    function circuitDepth(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (uint32) {
        return _analyze(processor, tokenId).depth;
    }

    /// @notice Real content-hash of the netlist, used by CompositionRegistry
    /// for staleness. Replaces the old guessed `netlistHash()` selector.
    function netlistHash(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (bytes32) {
        return keccak256(_processor(processor).netlist(tokenId));
    }

    /// @notice Full TAP-10 §13.8 seal test. Returns true only when the factory
    /// is sealed, the beacon still points at the reviewed implementation, and
    /// the beacon is owned by the factory — exactly the spec's definition.
    /// NOTE: live X Layer (verified 2026-11-20) reports beacon.owner() == 0,
    /// so this returns false there until that changes. Fail closed: an
    /// unsealed processor is reported unsealed, never silently assumed safe.
    /// Use sealEvidence() to see all three signals independently.
    function isSealed(address processor) external view onlyTapeOutProcessor(processor) returns (bool) {
        return factory.isSealed() && beacon.implementation() == pinnedCircuitImplementation && beacon.owner() == address(factory);
    }

    /// @notice Independent seal evidence — the three claims TAP-10 §13.8
    /// requires, exposed separately rather than collapsed into one boolean.
    function sealEvidence(address processor)
        external
        view
        onlyTapeOutProcessor(processor)
        returns (bool factorySealed, bool implementationMatches, bool beaconOwnedByFactory)
    {
        factorySealed = factory.isSealed();
        implementationMatches = beacon.implementation() == pinnedCircuitImplementation;
        beaconOwnedByFactory = beacon.owner() == address(factory);
    }

    function containerOf(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (address) {
        return opener.accountOf(processor, tokenId);
    }

    /// @notice TAP-10 §6.3 activation. A reverting payments call is treated as
    /// false, exactly as TAP-10 requires.
    function isContainerLive(
        address processor,
        address container
    ) external view onlyTapeOutProcessor(processor) returns (bool) {
        if (container == address(0)) return false;
        try payments.isContainerLive(container) returns (bool live) {
            return live;
        } catch {
            return false;
        }
    }

    /// @notice Raw netlist bytes, exposed for dependency analysis. This is
    /// the exact data TapRefs parses — no self-reported dependency list.
    function netlist(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (bytes memory) {
        return _processor(processor).netlist(tokenId);
    }

    function ownerOf(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (address) {
        return _processor(processor).ownerOf(tokenId);
    }

    /// @notice TAP-02 §2: nOut >= 1 for every existing circuit.
    function circuitExists(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (bool) {
        (, uint32 nOut, , ) = _processor(processor).circuitInfo(tokenId);
        return nOut != 0;
    }

    // ------------------------------------------------------------------
    // Audit / integration helpers (outside IProcessorAdapter)
    // ------------------------------------------------------------------

    /// @notice Full TAP-02 analysis plus the on-chain gateCount from
    /// circuitInfo. When the circuit has no REF, the two gate counts MUST
    /// agree — a live cross-check that the decoder matches the chain.
    function analyzeCircuit(
        address processor,
        uint256 tokenId
    )
        external
        view
        onlyTapeOutProcessor(processor)
        returns (TapNetlist.Analysis memory analysis, uint32 reportedGateCount, bytes32 netlistHash_)
    {
        ITapeOutProcessorV2 p = _processor(processor);
        bytes memory nl = p.netlist(tokenId);
        (uint32 nIn, uint32 nOut, , uint32 reported) = p.circuitInfo(tokenId);
        analysis = nl.analyze(nIn, nOut);
        if (!analysis.hasRef && analysis.gateCount != reported) {
            revert GateCountMismatch(analysis.gateCount, reported);
        }
        return (analysis, reported, keccak256(nl));
    }

    /// @notice True when the reported depth is a complete upper bound (no REF).
    function depthIsBounded(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (bool) {
        return !_analyze(processor, tokenId).hasRef;
    }

    /// @notice Whether the circuit's container has been opened (TAP-10 §6).
    function containerOpened(
        address processor,
        uint256 tokenId
    ) external view onlyTapeOutProcessor(processor) returns (bool) {
        return opener.isOpened(processor, tokenId);
    }
}
