// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITapeOutProcessorV2} from "../../interfaces/ITapeOutV2.sol";

/// @notice On-chain stand-in for a single real TapeOut processor, for local
/// tests and demo. Holds literal TAP-02 netlist bytes and the circuitInfo
/// tuple exactly as a real processor's eth_call returns them.
contract MockProcessorV2 is ITapeOutProcessorV2 {
    struct Circuit {
        uint32 nIn;
        uint32 nOut;
        uint32 nState;
        uint32 gateCount;
        bytes netlistBytes;
        address holder;
    }

    mapping(uint256 => Circuit) private _circuits;
    uint256 public nextId = 1;

    function setCircuit(
        uint256 id,
        uint32 nIn,
        uint32 nOut,
        uint32 nState,
        uint32 gateCount,
        bytes calldata netlistBytes,
        address holder
    ) external {
        _circuits[id] = Circuit(nIn, nOut, nState, gateCount, netlistBytes, holder);
        if (id >= nextId) nextId = id + 1;
    }

    function circuitInfo(uint256 id) external view returns (uint32, uint32, uint32, uint32) {
        Circuit storage c = _circuits[id];
        return (c.nIn, c.nOut, c.nState, c.gateCount);
    }

    function netlist(uint256 id) external view returns (bytes memory) {
        return _circuits[id].netlistBytes;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _circuits[tokenId].holder;
    }
}

/// @notice Exposes raw TAP-02 netlist bytes from a MockProcessorV2 to the
/// DependencyAnalyzer, which takes a separate INetlistReader by design.
contract MockNetlistReader {
    function netlist(address processor, uint256 tokenId) external view returns (bytes memory) {
        return MockProcessorV2(processor).netlist(tokenId);
    }

    function circuitExists(address processor, uint256 tokenId) external view returns (bool) {
        (, uint32 nOut, , ) = MockProcessorV2(processor).circuitInfo(tokenId);
        return nOut != 0;
    }
}

/// @notice Minimal stand-ins for the TAP-10 companion contracts the adapter
/// reads. Each exposes only the function the adapter calls.
contract MockFactoryV2 {
    mapping(address => bool) public isCPU;
    bool private _sealed;

    function setCPU(address cpu, bool v) external {
        isCPU[cpu] = v;
    }

    function setSealed(bool v) external {
        _sealed = v;
    }

    function isSealed() external view returns (bool) {
        return _sealed;
    }

    function cpuCount() external pure returns (uint256) {
        return 0;
    }

    function cpuAt(uint256) external pure returns (address) {
        return address(0);
    }
}

contract MockBeacon {
    address public implementation;
    address public owner;

    constructor(address impl, address owner_) {
        implementation = impl;
        owner = owner_;
    }

    function setOwner(address v) external {
        owner = v;
    }

    function setImplementation(address v) external {
        implementation = v;
    }
}
contract MockOpener {
    function accountOf(address circuits, uint256 tokenId) external pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encode(circuits, tokenId)))) >> 96);
    }

    function isOpened(address, uint256) external pure returns (bool) {
        return true;
    }
}

contract MockPayments {
    mapping(address => bool) public live;

    function setLive(address container, bool v) external {
        live[container] = v;
    }

    function isContainerLive(address container) external view returns (bool) {
        return live[container];
    }
}

/// @notice A payments contract whose isContainerLive always reverts — TAP-10
/// §6.3 requires the adapter to treat a revert as false.
contract MockPaymentsReverting {
    function isContainerLive(address) external pure returns (bool) {
        revert("no function");
    }
}
