// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProcessorAdapter} from "./interfaces/IProcessorAdapter.sol";

/// @title ProcessorAdapterRegistry
/// @notice Maps each TapeOut processor address to the adapter contract that
/// knows how to read it. CompositionRegistry and CompositionGate never talk
/// to a processor directly, they resolve an adapter here first. Repointing a
/// processor at a new adapter, after a real ABI is confirmed or changes, is
/// one transaction here, with no change to the audited core logic.
///
/// Deliberately simple for this build: one owner, one mapping. A production
/// version serving many unrelated processors might want per-processor
/// permissioning instead of a single owner, see README.md.
contract ProcessorAdapterRegistry {
    mapping(address => IProcessorAdapter) private _adapters;

    address public owner;

    event AdapterSet(address indexed processor, address indexed adapter);

    error NotOwner();
    error NoAdapterConfigured(address processor);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAdapter(address processor, address adapter) external onlyOwner {
        _adapters[processor] = IProcessorAdapter(adapter);
        emit AdapterSet(processor, adapter);
    }

    /// @notice Resolve the adapter for a processor, or revert loudly.
    /// Reverting instead of returning address(0) means a misconfigured
    /// processor fails every call clearly, rather than every derived fact
    /// silently reading as zero and looking like an empty, harmless circuit.
    function adapterFor(address processor) public view returns (IProcessorAdapter) {
        IProcessorAdapter a = _adapters[processor];
        if (address(a) == address(0)) revert NoAdapterConfigured(processor);
        return a;
    }

    function hasAdapter(address processor) external view returns (bool) {
        return address(_adapters[processor]) != address(0);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
