// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProcessorAdapterRegistry} from "../ProcessorAdapterRegistry.sol";
import {TapNetlist} from "../libraries/TapNetlist.sol";
import {TapRefs} from "../libraries/TapRefs.sol";

/// @notice Optional adapter capability: expose the raw netlist bytes. The
/// default IProcessorAdapter deliberately does not require this, so an
/// analyzer is a separate, opt-in component rather than a core dependency.
interface INetlistReader {
    function netlist(address processor, uint256 tokenId) external view returns (bytes memory);

    /// @notice Existence check: TAP-02 §2 requires nOut >= 1, so a circuit
    /// reporting nOut == 0 does not exist and must be reported as missing.
    function circuitExists(address processor, uint256 tokenId) external view returns (bool);
}

/// @title DependencyAnalyzer
/// @notice Discovers a circuit's dependencies from its actual on-chain
/// netlist instead of trusting a self-declared list. TAP-02 REF records name
/// (processor, circuit id) directly; walking them yields a canonical
/// dependency graph with cycle and missing-target detection.
///
/// BOUNDED: callers set maxDepth and maxCircuits. The walk is depth-first
/// with a visited set, so cycles terminate and each circuit is counted once.
/// A circuit that exceeds the caller's limits is reported, not silently
/// accepted as safe — fail closed on unknowns.
contract DependencyAnalyzer {
    using TapRefs for bytes;

    struct CircuitRef {
        address processor;
        uint256 tokenId;
    }

    struct DependencyReport {
        uint32 directRefs; // REF records in the root netlist
        uint32 totalCircuits; // distinct circuits reached (including root)
        uint32 maxDepth; // deepest REF chain found
        bool cycleDetected;
        bool missingTarget; // a REF target had no readable circuit
        bool truncated; // walk stopped at a caller limit
        bool complete; // true iff none of the above failure flags are set
        CircuitRef[] dependencies; // pre-sized to maxCircuits; only first depCount are real
        uint32 depCount; // number of populated entries in dependencies
    }

    ProcessorAdapterRegistry public immutable adapterRegistry;
    INetlistReader public immutable netlistReader;

    error ZeroAddress();

    constructor(address adapterRegistry_, address netlistReader_) {
        if (adapterRegistry_ == address(0) || netlistReader_ == address(0)) revert ZeroAddress();
        adapterRegistry = ProcessorAdapterRegistry(adapterRegistry_);
        netlistReader = INetlistReader(netlistReader_);
    }

    /// @notice Walk the REF closure of (processor, tokenId).
    /// @param maxDepth maximum REF chain length; deeper is reported truncated.
    /// @param maxCircuits maximum distinct circuits visited.
    function analyze(
        address processor,
        uint256 tokenId,
        uint32 maxDepth,
        uint32 maxCircuits
    ) external view returns (DependencyReport memory report) {
        report.dependencies = new CircuitRef[](maxCircuits);
        _walk(processor, tokenId, 0, maxDepth, maxCircuits, new bytes32[](0), report);
        report.complete = !report.cycleDetected && !report.missingTarget && !report.truncated;
    }

    function _walk(
        address processor,
        uint256 tokenId,
        uint32 depth,
        uint32 maxDepth,
        uint32 maxCircuits,
        bytes32[] memory stack,
        DependencyReport memory report
    ) private view {
        if (report.totalCircuits >= maxCircuits) {
            report.truncated = true;
            return;
        }
        // The visited stack prevents cycles (TAP-02 §3 says the closure
        // should be acyclic). A diamond may visit a node twice, which only
        // repeats an idempotent view check — acceptable and bounded by
        // maxCircuits.
        bytes32 key = keccak256(abi.encodePacked(processor, tokenId));
        for (uint256 i = 0; i < stack.length; i++) {
            if (stack[i] == key) {
                report.cycleDetected = true;
                return;
            }
        }
        report.totalCircuits++;
        if (depth > report.maxDepth) report.maxDepth = depth;
        // Record every non-root circuit reached, so callers can apply their
        // own policy to each dependency (e.g. staleness of its attestation).
        if (depth > 0 && report.depCount < maxCircuits) {
            report.dependencies[report.depCount] = CircuitRef(processor, tokenId);
            report.depCount++;
        }

        // The ROOT processor must be configured: fail closed loudly so an
        // unknown circuit is never presented as harmless.
        if (depth == 0) adapterRegistry.adapterFor(processor);
        // A REF *target* on a processor with no adapter is a missing target,
        // not a fatal error — report it so the caller can reject the closure.
        else {
            // Low-level staticcall: adapterFor() reverts when unconfigured.
            (bool ok, ) = address(adapterRegistry).staticcall(
                abi.encodeWithSelector(
                    ProcessorAdapterRegistry.adapterFor.selector, processor
                )
            );
            if (!ok) {
                report.missingTarget = true;
                return;
            }
        }
        bytes memory nl;
        try netlistReader.circuitExists(processor, tokenId) returns (bool exists) {
            if (!exists) {
                report.missingTarget = true;
                return;
            }
        } catch {
            report.missingTarget = true;
            return;
        }
        try netlistReader.netlist(processor, tokenId) returns (bytes memory found) {
            nl = found;
        } catch {
            report.missingTarget = true;
            return;
        }

        TapRefs.Target[] memory refs = nl.targets();
        if (depth == 0) report.directRefs = uint32(refs.length);

        if (depth >= maxDepth && refs.length > 0) {
            report.truncated = true;
            return;
        }

        bytes32[] memory next = new bytes32[](stack.length + 1);
        for (uint256 i = 0; i < stack.length; i++) next[i] = stack[i];
        next[stack.length] = key;

        for (uint256 i = 0; i < refs.length; i++) {
            _walk(refs[i].processor, refs[i].id, depth + 1, maxDepth, maxCircuits, next, report);
            if (report.truncated || report.cycleDetected) return;
        }
    }
}
