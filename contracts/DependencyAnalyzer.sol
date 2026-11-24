// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProcessorAdapterRegistry} from "../ProcessorAdapterRegistry.sol";
import {TapRefs} from "../libraries/TapRefs.sol";

interface INetlistReader {
    function netlist(address processor, uint256 tokenId) external view returns (bytes memory);
    function circuitExists(address processor, uint256 tokenId) external view returns (bool);
}

/// @title DependencyAnalyzer
/// @notice Resolves the actual REF graph. Unique circuit identities are
/// deduplicated for policy/attestation checks, while expandedInstances counts
/// every REF occurrence. A shared child in a diamond is one unique circuit
/// but may represent multiple evaluation instances.
contract DependencyAnalyzer {
    using TapRefs for bytes;

    uint32 public constant MAX_ANALYSIS_DEPTH = 32;
    uint32 public constant MAX_UNIQUE_CIRCUITS = 128;
    uint32 public constant MAX_EXPANDED_INSTANCES = 512;

    struct CircuitRef {
        address processor;
        uint256 tokenId;
    }

    struct DependencyReport {
        uint32 directRefs;
        uint32 totalCircuits; // unique identities, including root
        uint32 expandedInstances; // root plus every REF occurrence
        uint32 maxDepth;
        bool cycleDetected;
        bool missingTarget;
        bool truncated;
        bool complete;
        CircuitRef[] dependencies; // unique non-root circuits
        uint32 depCount;
    }

    ProcessorAdapterRegistry public immutable adapterRegistry;
    INetlistReader public immutable netlistReader;

    error ZeroAddress();
    error InvalidLimits(uint32 maxDepth, uint32 maxCircuits);

    constructor(address adapterRegistry_, address netlistReader_) {
        if (adapterRegistry_ == address(0) || netlistReader_ == address(0)) revert ZeroAddress();
        adapterRegistry = ProcessorAdapterRegistry(adapterRegistry_);
        netlistReader = INetlistReader(netlistReader_);
    }

    function analyze(
        address processor,
        uint256 tokenId,
        uint32 maxDepth,
        uint32 maxCircuits
    ) external view returns (DependencyReport memory report) {
        if (
            maxDepth > MAX_ANALYSIS_DEPTH ||
            maxCircuits == 0 ||
            maxCircuits > MAX_UNIQUE_CIRCUITS
        ) revert InvalidLimits(maxDepth, maxCircuits);

        report.dependencies = new CircuitRef[](maxCircuits);
        bytes32[] memory stack = new bytes32[](uint256(maxDepth) + 1);
        bytes32[] memory visited = new bytes32[](maxCircuits);
        uint32[] memory visitedCount = new uint32[](1);
        _walk(processor, tokenId, 0, maxDepth, maxCircuits, stack, visited, visitedCount, report);
        report.complete = !report.cycleDetected && !report.missingTarget && !report.truncated;
    }

    function _walk(
        address processor,
        uint256 tokenId,
        uint32 depth,
        uint32 maxDepth,
        uint32 maxCircuits,
        bytes32[] memory stack,
        bytes32[] memory visited,
        uint32[] memory visitedCount,
        DependencyReport memory report
    ) private view {
        bytes32 key = keccak256(abi.encodePacked(processor, tokenId));

        // Check the active recursion path first. A repeated node on the
        // current path is a cycle; a node visited on another branch is a
        // shared dependency and must not be traversed or counted twice.
        for (uint256 i = 0; i < depth; i++) {
            if (stack[i] == key) {
                report.cycleDetected = true;
                return;
            }
        }
        for (uint256 i = 0; i < visitedCount[0]; i++) {
            if (visited[i] == key) return;
        }

        if (visitedCount[0] >= maxCircuits) {
            report.truncated = true;
            return;
        }
        visited[visitedCount[0]] = key;
        visitedCount[0]++;
        report.totalCircuits = visitedCount[0];
        if (depth > report.maxDepth) report.maxDepth = depth;
        stack[depth] = key;

        if (depth > 0) {
            report.dependencies[report.depCount] = CircuitRef(processor, tokenId);
            report.depCount++;
        }

        if (depth == 0) {
            adapterRegistry.adapterFor(processor);
        } else {
            (bool ok, ) = address(adapterRegistry).staticcall(
                abi.encodeWithSelector(ProcessorAdapterRegistry.adapterFor.selector, processor)
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

        for (uint256 i = 0; i < refs.length; i++) {
            if (report.expandedInstances >= MAX_EXPANDED_INSTANCES) {
                report.truncated = true;
                return;
            }
            report.expandedInstances++;
            _walk(
                refs[i].processor,
                refs[i].id,
                depth + 1,
                maxDepth,
                maxCircuits,
                stack,
                visited,
                visitedCount,
                report
            );
            if (report.truncated || report.cycleDetected || report.missingTarget) return;
        }
    }
}
