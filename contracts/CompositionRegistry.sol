// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProcessorAdapter} from "./interfaces/IProcessorAdapter.sol";
import {ProcessorAdapterRegistry} from "./ProcessorAdapterRegistry.sol";

/// @title CompositionRegistry
/// @notice Holds Layer 2 (declared) facts about TapeOut circuits: intended
/// behavior, declared dependencies, audit links, and risk tier. Layer 1
/// (derived) facts — gate count, depth, estimated gas — live on
/// CompositionGate instead, read directly from the processor; they are
/// already trustless on-chain facts and storing a copy here would just be a
/// second, staler source of truth.
///
/// Two separate attestation tracks are kept deliberately apart, a publisher's
/// self-declared claim about their own circuit is not the same kind of fact
/// as an independent auditor's review, and collapsing them into one record
/// would let a publisher's own risk tier masquerade as third-party
/// verification. getPublisherAttestation / getAuditorAttestation both
/// re-check the live netlist hash on every read and report staleness, a
/// stale record is never silently treated as current.
///
/// Every attest() call is versioned: re-attesting does not overwrite history,
/// it increments a version counter and emits a new event, so the full
/// attestation history for a circuit is reconstructable from logs even
/// though only the latest record is kept in storage.
contract CompositionRegistry {
    enum RiskTier {
        None,
        Low,
        Moderate,
        High
    }

    struct Attestation {
        bytes32 circuitNetlistHash; // netlist hash at the time of attestation
        bytes32 processorIdentityHash; // processor implementation/trust identity at attestation
        uint32 declaredDepsCount;
        bytes32 depsListHash; // keccak256 of the full declared dependency list
        RiskTier riskTier;
        string auditURI;
        address attestor;
        uint64 attestedAt;
        uint32 version; // increments on every re-attestation for this (processor, tokenId)
        bool exists;
    }

    /// @notice processor => tokenId => latest publisher attestation
    mapping(address => mapping(uint256 => Attestation)) private _publisherAttestations;

    /// @notice processor => tokenId => latest auditor attestation
    mapping(address => mapping(uint256 => Attestation)) private _auditorAttestations;

    /// @notice processor => tokenId => version counter, shared across both
    /// tracks so version numbers are unique per circuit regardless of which
    /// track wrote them.
    mapping(address => mapping(uint256 => uint32)) private _versionCounter;

    /// @notice Addresses allowed to write auditor attestations. Owner-managed
    /// allowlist, deliberately simple for a hackathon build; a production
    /// version would likely want a stake- or reputation-gated allowlist
    /// instead of an owner-curated one.
    mapping(address => bool) public isAuthorizedAuditor;

    /// @notice Fee charged to the attestor when writing a publisher
    /// attestation, in wei (OKB on X Layer). Auditor attestations are free to
    /// encourage review. Lookups are always free.
    uint256 public attestationFee;

    ProcessorAdapterRegistry public immutable adapterRegistry;

    address public feeRecipient;
    address public owner;

    event PublisherAttested(
        address indexed processor,
        uint256 indexed tokenId,
        address indexed attestor,
        bytes32 netlistHash,
        bytes32 processorIdentityHash,
        uint32 declaredDepsCount,
        RiskTier riskTier,
        uint32 version
    );

    event AuditorAttested(
        address indexed processor,
        uint256 indexed tokenId,
        address indexed auditor,
        bytes32 netlistHash,
        bytes32 processorIdentityHash,
        RiskTier riskTier,
        uint32 version
    );

    event AuditorAuthorized(address indexed auditor, bool authorized);
    event AttestationFeeUpdated(uint256 newFee);
    event FeeRecipientUpdated(address newRecipient);

    error NotOwner();
    error NotAuthorizedAuditor();
    error InsufficientFee(uint256 sent, uint256 required);
    error NotCircuitHolder(address caller, address actualOwner);
    error ZeroAddress();
    error AdapterIdentityUnavailable(address processor);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _adapterRegistry, uint256 _attestationFee, address _feeRecipient) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_adapterRegistry == address(0)) revert ZeroAddress();
        owner = msg.sender;
        adapterRegistry = ProcessorAdapterRegistry(_adapterRegistry);
        attestationFee = _attestationFee;
        feeRecipient = _feeRecipient;
    }

    /// @notice Attest Layer 2 facts as the circuit's publisher. Enforced:
    /// msg.sender must be the circuit's current holder per the processor's
    /// own ownerOf(). A prior holder's attestation does not carry forward to
    /// a new owner, it simply becomes irrelevant to future checks once a new
    /// attestation (or none) reflects the new holder.
    function attestAsPublisher(
        address processor,
        uint256 tokenId,
        uint32 declaredDepsCount,
        bytes32 depsListHash,
        RiskTier riskTier,
        string calldata auditURI
    ) external payable {
        if (msg.value < attestationFee) {
            revert InsufficientFee(msg.value, attestationFee);
        }

        address actualOwner = adapterRegistry.adapterFor(processor).ownerOf(processor, tokenId);
        if (msg.sender != actualOwner) {
            revert NotCircuitHolder(msg.sender, actualOwner);
        }

        bytes32 currentNetlistHash = adapterRegistry.adapterFor(processor).netlistHash(
            processor,
            tokenId
        );
        bytes32 currentIdentityHash = _processorIdentityHash(processor);
        uint32 newVersion = ++_versionCounter[processor][tokenId];

        _publisherAttestations[processor][tokenId] = Attestation({
            circuitNetlistHash: currentNetlistHash,
            processorIdentityHash: currentIdentityHash,
            declaredDepsCount: declaredDepsCount,
            depsListHash: depsListHash,
            riskTier: riskTier,
            auditURI: auditURI,
            attestor: msg.sender,
            attestedAt: uint64(block.timestamp),
            version: newVersion,
            exists: true
        });

        if (attestationFee > 0) {
            (bool sent, ) = feeRecipient.call{value: msg.value}("");
            require(sent, "fee transfer failed");
        }

        emit PublisherAttested(
            processor,
            tokenId,
            msg.sender,
            currentNetlistHash,
            currentIdentityHash,
            declaredDepsCount,
            riskTier,
            newVersion
        );
    }

    /// @notice Attest an independent review as an authorized auditor. Not
    /// gated by circuit ownership, gated by the auditor allowlist instead, so
    /// an auditor's claim is never confused with the publisher's own.
    function attestAsAuditor(
        address processor,
        uint256 tokenId,
        RiskTier riskTier,
        string calldata auditURI
    ) external {
        if (!isAuthorizedAuditor[msg.sender]) {
            revert NotAuthorizedAuditor();
        }

        bytes32 currentNetlistHash = adapterRegistry.adapterFor(processor).netlistHash(
            processor,
            tokenId
        );
        bytes32 currentIdentityHash = _processorIdentityHash(processor);
        uint32 newVersion = ++_versionCounter[processor][tokenId];

        _auditorAttestations[processor][tokenId] = Attestation({
            circuitNetlistHash: currentNetlistHash,
            processorIdentityHash: currentIdentityHash,
            declaredDepsCount: 0,
            depsListHash: bytes32(0),
            riskTier: riskTier,
            auditURI: auditURI,
            attestor: msg.sender,
            attestedAt: uint64(block.timestamp),
            version: newVersion,
            exists: true
        });

        emit AuditorAttested(
            processor,
            tokenId,
            msg.sender,
            currentNetlistHash,
            currentIdentityHash,
            riskTier,
            newVersion
        );
    }

    /// @notice Read a circuit's publisher attestation. Always free. `stale`
    /// is true if the netlist, current holder, or processor trust identity changed.
    function getPublisherAttestation(
        address processor,
        uint256 tokenId
    ) public view returns (Attestation memory a, bool stale) {
        a = _publisherAttestations[processor][tokenId];
        return _withStaleness(processor, tokenId, a, true);
    }

    /// @notice Read a circuit's auditor attestation, same staleness semantics.
    function getAuditorAttestation(
        address processor,
        uint256 tokenId
    ) public view returns (Attestation memory a, bool stale) {
        a = _auditorAttestations[processor][tokenId];
        return _withStaleness(processor, tokenId, a, false);
    }

    function _withStaleness(
        address processor,
        uint256 tokenId,
        Attestation memory a,
        bool requireCurrentHolder
    ) private view returns (Attestation memory, bool stale) {
        if (!a.exists) {
            return (a, true);
        }
        bytes32 currentHash = adapterRegistry.adapterFor(processor).netlistHash(
            processor,
            tokenId
        );
        stale = currentHash != a.circuitNetlistHash || _processorIdentityHash(processor) != a.processorIdentityHash;
        if (requireCurrentHolder) {
            address currentHolder = adapterRegistry.adapterFor(processor).ownerOf(processor, tokenId);
            stale = stale || currentHolder != a.attestor;
        }
        return (a, stale);
    }

        function _processorIdentityHash(address processor) private view returns (bytes32 identityHash) {
        address adapter = address(adapterRegistry.adapterFor(processor));
        (bool ok, bytes memory result) = adapter.staticcall(
            abi.encodeWithSignature("trustIdentity(address)", processor)
        );
        if (!ok || result.length != 32) revert AdapterIdentityUnavailable(processor);
        identityHash = abi.decode(result, (bytes32));
    }

    function hasPublisherAttestation(
        address processor,
        uint256 tokenId
    ) external view returns (bool) {
        return _publisherAttestations[processor][tokenId].exists;
    }

    function hasAuditorAttestation(
        address processor,
        uint256 tokenId
    ) external view returns (bool) {
        return _auditorAttestations[processor][tokenId].exists;
    }

    // --- admin ---

    function setAuditorAuthorized(
        address auditor,
        bool authorized
    ) external onlyOwner {
        isAuthorizedAuditor[auditor] = authorized;
        emit AuditorAuthorized(auditor, authorized);
    }

    function setAttestationFee(uint256 newFee) external onlyOwner {
        attestationFee = newFee;
        emit AttestationFeeUpdated(newFee);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
}
