// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProcessorAdapterRegistry} from "../ProcessorAdapterRegistry.sol";
import {TapRefs} from "../libraries/TapRefs.sol";
import {TapNetlist} from "../libraries/TapNetlist.sol";

interface INetlistReader {
    function netlist(address processor, uint256 tokenId) external view returns (bytes memory);
    function circuitExists(address processor, uint256 tokenId) external view returns (bool);
    function circuitInfo(address processor, uint256 tokenId)
        external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
}

/// @title DependencyAnalyzer
/// @notice Resolves the actual REF graph. Unique circuit identities are
/// deduplicated for policy/attestation checks, while expandedInstances counts
/// every occurrence in the recursively expanded evaluation tree.
contract DependencyAnalyzer {
    using TapRefs for bytes;
    using TapNetlist for bytes;

    uint32 public constant MAX_ANALYSIS_DEPTH = 32;
    uint32 public constant MAX_UNIQUE_CIRCUITS = 128;
    uint32 public constant MAX_EXPANDED_INSTANCES = 512;

    struct CircuitRef {
        address processor;
        uint256 tokenId;
    }

    struct DependencyReport {
        uint32 directRefs;
        uint32 directDepsCount;
        bytes32 directDepsHash;
        uint32 totalCircuits;
        uint32 expandedInstances;
        uint32 maxDepth;
        bool cycleDetected;
        bool missingTarget;
        bool truncated;
        bool complete;
        CircuitRef[] dependencies;
        uint32 depCount;
    }

    struct Traversal {
        uint32 maxDepth;
        uint32 maxCircuits;
        uint32 visitedCount;
        bytes32[] stack;
        bytes32[] visited;
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
        Traversal memory traversal;
        traversal.maxDepth = maxDepth;
        traversal.maxCircuits = maxCircuits;
        traversal.stack = new bytes32[](uint256(maxDepth) + 1);
        traversal.visited = new bytes32[](maxCircuits);

        _walk(processor, tokenId, 0, traversal, report);
        report.complete = !report.cycleDetected && !report.missingTarget && !report.truncated;
    }

    function _directDependencyHash(TapRefs.Target[] memory refs)
        private pure returns (uint32 count, bytes32 digest)
    {
        if (refs.length == 0) return (0, bytes32(0));

        address[] memory processors = new address[](refs.length);
        uint256[] memory circuitIds = new uint256[](refs.length);
        for (uint256 i = 0; i < refs.length; i++) {
            bool exists;
            for (uint256 j = 0; j < count; j++) {
                if (processors[j] == refs[i].processor && circuitIds[j] == refs[i].id) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                processors[count] = refs[i].processor;
                circuitIds[count] = refs[i].id;
                count++;
            }
        }

        for (uint256 i = 1; i < count; i++) {
            address cpu = processors[i];
            uint256 id = circuitIds[i];
            uint256 j = i;
            while (
                j > 0 &&
                (
                    uint160(processors[j - 1]) > uint160(cpu) ||
                    (processors[j - 1] == cpu && circuitIds[j - 1] > id)
                )
            ) {
                processors[j] = processors[j - 1];
                circuitIds[j] = circuitIds[j - 1];
                j--;
            }
            processors[j] = cpu;
            circuitIds[j] = id;
        }

        address[] memory sortedProcessors = new address[](count);
        uint256[] memory sortedIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            sortedProcessors[i] = processors[i];
            sortedIds[i] = circuitIds[i];
        }
        digest = keccak256(abi.encode(sortedProcessors, sortedIds));
    }

    /// @dev Strictly validates the current netlist and every direct REF target.
    /// Readers that cannot provide circuitInfo are rejected as incomplete.
    function _loadTargets(address processor, uint256 tokenId)
        private view returns (TapRefs.Target[] memory refs, bool readable)
    {
        try netlistReader.circuitExists(processor, tokenId) returns (bool exists) {
            if (!exists) return (refs, false);
        } catch {
            return (refs, false);
        }

        bytes memory nl;
        try netlistReader.netlist(processor, tokenId) returns (bytes memory found) {
            nl = found;
        } catch {
            return (refs, false);
        }

        uint32 nIn;
        uint32 nOut;
        try netlistReader.circuitInfo(processor, tokenId) returns (
            uint32 declaredInputs, uint32 declaredOutputs, uint32, uint32
        ) {
            nIn = declaredInputs;
            nOut = declaredOutputs;
        } catch {
            return (refs, false);
        }

        nl.analyze(nIn, nOut);
        refs = nl.targets();

        for (uint256 i = 0; i < refs.length; i++) {
            try netlistReader.circuitInfo(refs[i].processor, refs[i].id) returns (
                uint32 targetNIn, uint32 targetNOut, uint32, uint32
            ) {
                if (targetNIn != refs[i].nIns || targetNOut != refs[i].nOuts) {
                    return (refs, false);
                }
            } catch {
                return (refs, false);
            }
        }
        return (refs, true);
    }

    function _walk(
        address processor,
        uint256 tokenId,
        uint32 depth,
        Traversal memory traversal,
        DependencyReport memory report
    ) private view {
        // Every invocation is one expanded evaluation instance, including a
        // repeated circuit reached through another REF edge. Bound work before
        // doing any external reads or parsing.
        if (report.expandedInstances >= MAX_EXPANDED_INSTANCES) {
            report.truncated = true;
            return;
        }
        report.expandedInstances++;

        bytes32 key = keccak256(abi.encodePacked(processor, tokenId));
        for (uint256 i = 0; i < depth; i++) {
            if (traversal.stack[i] == key) {
                report.cycleDetected = true;
                return;
            }
        }

        bool seen;
        for (uint256 i = 0; i < traversal.visitedCount; i++) {
            if (traversal.visited[i] == key) {
                seen = true;
                break;
            }
        }
        if (!seen) {
            if (traversal.visitedCount >= traversal.maxCircuits) {
                report.truncated = true;
                return;
            }
            traversal.visited[traversal.visitedCount] = key;
            traversal.visitedCount++;
            report.totalCircuits = traversal.visitedCount;
            if (depth > 0) {
                report.dependencies[report.depCount] = CircuitRef(processor, tokenId);
                report.depCount++;
            }
        }

        if (depth > report.maxDepth) report.maxDepth = depth;
        traversal.stack[depth] = key;

        if (depth == 0) {
            adapterRegistry.adapterFor(processor);
        } else {
            (bool configured, ) = address(adapterRegistry).staticcall(
                abi.encodeWithSelector(ProcessorAdapterRegistry.adapterFor.selector, processor)
            );
            if (!configured) {
                report.missingTarget = true;
                return;
            }
        }

        (TapRefs.Target[] memory refs, bool readable) = _loadTargets(processor, tokenId);
        if (!readable) {
            report.missingTarget = true;
            return;
        }

        if (depth == 0) {
            report.directRefs = uint32(refs.length);
            (report.directDepsCount, report.directDepsHash) = _directDependencyHash(refs);
        }

        if (depth >= traversal.maxDepth && refs.length > 0) {
            report.truncated = true;
            return;
        }

        for (uint256 i = 0; i < refs.length; i++) {
            _walk(refs[i].processor, refs[i].id, depth + 1, traversal, report);
            if (report.truncated || report.cycleDetected || report.missingTarget) return;
        }
    }
}
