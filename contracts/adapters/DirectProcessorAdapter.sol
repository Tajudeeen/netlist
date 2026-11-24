// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProcessorAdapter} from "../interfaces/IProcessorAdapter.sol";
import {ITapeOutProcessor} from "../interfaces/ITapeOutProcessor.sol";

/// @title DirectProcessorAdapter
/// @notice Default adapter: assumes the processor itself directly implements
/// ITapeOutProcessor. This is the provisional, unverified ABI this build
/// started with, see ITapeOutProcessor.sol's notes. It is isolated here,
/// behind IProcessorAdapter, specifically so it can be deployed fresh and
/// swapped in ProcessorAdapterRegistry the moment a real ABI is confirmed
/// (TAP-02's content, if it reappears, or whatever replaces it), without
/// redeploying or re-auditing CompositionRegistry or CompositionGate.
///
/// One adapter instance can serve any number of processors that happen to
/// share this same assumed interface; it takes the processor address on
/// every call rather than being deployed per-processor.
contract DirectProcessorAdapter is IProcessorAdapter {
    function trustIdentity(address processor) external view returns (bytes32) {
        return processor.codehash;
    }

    function gateCount(address processor, uint256 tokenId) external view returns (uint32) {
        return ITapeOutProcessor(processor).gateCount(tokenId);
    }

    function circuitDepth(address processor, uint256 tokenId) external view returns (uint32) {
        return ITapeOutProcessor(processor).circuitDepth(tokenId);
    }

    function netlistHash(address processor, uint256 tokenId) external view returns (bytes32) {
        return ITapeOutProcessor(processor).netlistHash(tokenId);
    }

    function isSealed(address processor) external view returns (bool) {
        return ITapeOutProcessor(processor).isSealed();
    }

    function containerOf(address processor, uint256 tokenId) external view returns (address) {
        return ITapeOutProcessor(processor).containerOf(tokenId);
    }

    function isContainerLive(address processor, address container) external view returns (bool) {
        return ITapeOutProcessor(processor).isContainerLive(container);
    }

    function ownerOf(address processor, uint256 tokenId) external view returns (address) {
        return ITapeOutProcessor(processor).ownerOf(tokenId);
    }
}
