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

    IProcessorAdapter public defaultAdapter;
    address public owner;

    event AdapterSet(address indexed processor, address indexed adapter);
    event DefaultAdapterSet(address indexed adapter);

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

    function setDefaultAdapter(address adapter) external onlyOwner {
        defaultAdapter = IProcessorAdapter(adapter);
        emit DefaultAdapterSet(adapter);
    }

    /// @notice Resolve a processor-specific adapter, then the default adapter.
    /// The adapter itself must still verify that the processor belongs to its factory.
    function adapterFor(address processor) public view returns (IProcessorAdapter) {
        IProcessorAdapter a = _adapters[processor];
        if (address(a) == address(0)) a = defaultAdapter;
        if (address(a) == address(0)) revert NoAdapterConfigured(processor);
        return a;
    }

    function hasAdapter(address processor) external view returns (bool) {
        return address(_adapters[processor]) != address(0) || address(defaultAdapter) != address(0);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
