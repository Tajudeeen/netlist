// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProcessorAdapter} from "./interfaces/IProcessorAdapter.sol";
import {ProcessorAdapterRegistry} from "./ProcessorAdapterRegistry.sol";
import {CompositionRegistry} from "./CompositionRegistry.sol";
import {DependencyAnalyzer} from "./DependencyAnalyzer.sol";

/// @title CompositionGate
/// @notice Pre-call composability check for TapeOut circuits. A container (or
/// any caller) checks a target circuit here before composing it.
///
///  Layer 1, Derived (trustless): gate count, depth, estimatedGas, read live
///  from the processor's netlist. Not self-reported.
///  Layer 2, Declared (attested): CompositionRegistry's publisher and auditor
///  tracks, kept separate, each checked for staleness against the live
///  netlist hash on every read.
///  Layer 3, Network (live, not cached): processor seal status, container
///  activation, re-read at call time, never assumed from a prior check.
///
/// statusReport() returns every one of these as its own field rather than
/// collapsing them into a single boolean, a processor being sealed and a
/// circuit being safe are different claims and should never be compressed
/// into one "isSafe" flag that hides which specific thing is true or false.
/// checkCall() and requireCallAllowed() apply a GatePolicy on top of that
/// same status report for callers who just want a pass/fail answer.
///
/// IMPORTANT — enforcement vs. advisory: calling this contract is a choice a
/// composing container makes. Whether TapeOut's real processor-to-processor
/// call mechanism actually forces every composition through a check like this
/// is not documented in TapeKit or TAPs as of this build (see
/// ITapeOutProcessor's notes on the unverified composition ABI). Treat this
/// as an advisory pre-flight check a well-behaved container calls
/// voluntarily, not a protocol-enforced guarantee, until that's confirmed.
/// requireCallAllowed() reverts when its own check fails, which stops a
/// caller that actually invokes it, it does not stop a caller that skips it
/// entirely.
contract CompositionGate {
    struct GatePolicy {
        uint256 maxEstimatedGas; // 0 = unbounded
        uint32 maxDepsCount; // 0 = unbounded
        CompositionRegistry.RiskTier maxRiskTier;
        bool requireSealed;
        bool requireContainerLive;
        bool rejectStale;
        bool rejectUnattested; // requires a non-stale publisher attestation
        bool requireAuditorReview; // additionally requires a non-stale auditor attestation
    }

    /// @notice Full breakdown of every fact the gate can observe about a
    /// circuit, each field independent, none of them collapsed into the others.
    struct StatusReport {
        // Layer 1, derived
        uint32 gateCount;
        uint32 depth;
        uint256 estimatedGas; // see gasPerGate notes below — a flat estimate, not a proven bound
        // Layer 2, declared
        bool hasPublisherAttestation;
        bool publisherAttestationStale;
        CompositionRegistry.RiskTier publisherRiskTier;
        uint32 declaredDepsCount;
        bool hasAuditorAttestation;
        bool auditorAttestationStale;
        CompositionRegistry.RiskTier auditorRiskTier;
        // Layer 3, network, live
        bool processorSealed;
        address container;
        bool containerLive;
    }

    CompositionRegistry public immutable registry;
    ProcessorAdapterRegistry public immutable adapterRegistry;

    /// @notice Flat per-gate cost estimate used to compute estimatedGas from
    /// gate count alone. ITapeOutProcessor exposes no per-gate-type cost
    /// breakdown (NAND vs LATCH vs any other record type may cost differently
    /// to evaluate), so this is a deliberately conservative, documented
    /// approximation, not a proven upper bound. Tune via setGasPerGate once
    /// real gate-type cost data is available from the actual processor ABI.
    /// Treat estimatedGas as a benchmark figure for comparing circuits against
    /// each other, not as a safety guarantee on its own.
    uint256 public gasPerGate;

    address public owner;

    event GasPerGateUpdated(uint256 newValue);

    error NotOwner();
    error CallNotAllowed(string reason);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address registryAddress, address adapterRegistryAddress, uint256 initialGasPerGate) {
        owner = msg.sender;
        registry = CompositionRegistry(registryAddress);
        adapterRegistry = ProcessorAdapterRegistry(adapterRegistryAddress);
        gasPerGate = initialGasPerGate;
    }

    /// @notice The full three-layer status breakdown for a circuit, read
    /// live, nothing cached, nothing collapsed.
    function statusReport(
        address processor,
        uint256 tokenId
    ) public view returns (StatusReport memory r) {
        IProcessorAdapter p = adapterRegistry.adapterFor(processor);

        r.gateCount = p.gateCount(processor, tokenId);
        r.depth = p.circuitDepth(processor, tokenId);
        r.estimatedGas = uint256(r.gateCount) * gasPerGate;

        (
            CompositionRegistry.Attestation memory pub,
            bool pubStale
        ) = registry.getPublisherAttestation(processor, tokenId);
        r.hasPublisherAttestation = pub.exists;
        r.publisherAttestationStale = pubStale;
        r.publisherRiskTier = pub.riskTier;
        r.declaredDepsCount = pub.declaredDepsCount;

        (
            CompositionRegistry.Attestation memory aud,
            bool audStale
        ) = registry.getAuditorAttestation(processor, tokenId);
        r.hasAuditorAttestation = aud.exists;
        r.auditorAttestationStale = audStale;
        r.auditorRiskTier = aud.riskTier;

        r.processorSealed = p.isSealed(processor);
        r.container = p.containerOf(processor, tokenId);
        r.containerLive = r.container == address(0)
            ? false
            : p.isContainerLive(processor, r.container);
    }

    /// @notice Apply a policy against a circuit's status report.
    /// @return allowed Whether the target passes.
    /// @return reason Machine-readable reason when denied, empty when allowed.
    /// One of: "no-attestation", "stale", "gas-estimate", "deps-count",
    /// "risk-tier", "unsealed", "container-dead", "no-audit", "audit-stale".
    /// checkCallWithDependencies() adds "dep-cycle", "dep-missing",
    /// "dep-unbounded" for incomplete REF closures.
    function checkCall(
        address processor,
        uint256 tokenId,
        GatePolicy calldata policy
    ) public view returns (bool allowed, string memory reason) {
        StatusReport memory r = statusReport(processor, tokenId);

        if (
            policy.maxEstimatedGas != 0 &&
            r.estimatedGas > policy.maxEstimatedGas
        ) {
            return (false, "gas-estimate");
        }

        if (!r.hasPublisherAttestation) {
            if (policy.rejectUnattested) {
                return (false, "no-attestation");
            }
        } else {
            if (r.publisherAttestationStale && policy.rejectStale) {
                return (false, "stale");
            }
            if (
                policy.maxDepsCount != 0 &&
                r.declaredDepsCount > policy.maxDepsCount
            ) {
                return (false, "deps-count");
            }
            if (uint8(r.publisherRiskTier) > uint8(policy.maxRiskTier)) {
                return (false, "risk-tier");
            }
        }

        if (policy.requireAuditorReview) {
            if (!r.hasAuditorAttestation) {
                return (false, "no-audit");
            }
            if (r.auditorAttestationStale && policy.rejectStale) {
                return (false, "audit-stale");
            }
        }

        if (policy.requireSealed && !r.processorSealed) {
            return (false, "unsealed");
        }
        if (policy.requireContainerLive && !r.containerLive) {
            return (false, "container-dead");
        }

        return (true, "");
    }

    /// @notice Same check as checkCall, but reverts with CallNotAllowed(reason)
    /// instead of returning false. For a composing contract that wants a
    /// single call it can put directly in front of its own logic.
    function requireCallAllowed(
        address processor,
        uint256 tokenId,
        GatePolicy calldata policy
    ) external view {
        (bool allowed, string memory reason) = checkCall(
            processor,
            tokenId,
            policy
        );
        if (!allowed) {
            revert CallNotAllowed(reason);
        }
    }

    /// @notice A conservative default policy: require a non-stale publisher
    /// attestation, require the processor sealed, require the container
    /// live, no auditor review required, no gas or deps ceiling (0 =
    /// unbounded, tighten per integration).
    function defaultPolicy() external pure returns (GatePolicy memory) {
        return
            GatePolicy({
                maxEstimatedGas: 0,
                maxDepsCount: 0,
                maxRiskTier: CompositionRegistry.RiskTier.Moderate,
                requireSealed: true,
                requireContainerLive: true,
                rejectStale: true,
                rejectUnattested: true,
                requireAuditorReview: false
            });
    }

    /// @notice Same checkCall policy, PLUS a bounded walk of the circuit's
    /// REF dependencies. Rejects when the closure is incomplete (cycle,
    /// missing target, or caller-set limits exceeded) — a composing caller
    /// that needs transitive guarantees uses this instead of checkCall().
    /// Deliberately a separate method: checkCall() stays cheap and its ABI
    /// unchanged for existing integrations.
    function checkCallWithDependencies(
        address processor,
        uint256 tokenId,
        GatePolicy calldata policy,
        address analyzerAddress,
        uint32 maxDepth,
        uint32 maxCircuits
    ) external view returns (bool allowed, string memory reason) {
        (allowed, reason) = checkCall(processor, tokenId, policy);
        if (!allowed) return (allowed, reason);

        DependencyAnalyzer.DependencyReport memory dep =
            DependencyAnalyzer(analyzerAddress).analyze(
                processor, tokenId, maxDepth, maxCircuits
            );
        if (dep.cycleDetected) return (false, "dep-cycle");
        if (dep.missingTarget) return (false, "dep-missing");
        if (dep.truncated) return (false, "dep-unbounded");

        // Structural completeness is not enough: each reached dependency
        // must itself satisfy the policy. This is what makes a stale
        // downstream attestation propagate to the parent composition.
        for (uint256 i = 0; i < dep.depCount; i++) {
            (bool depAllowed, string memory depReason) = checkCall(
                dep.dependencies[i].processor, dep.dependencies[i].tokenId, policy
            );
            if (!depAllowed) return (false, depReason);
        }
        return (true, "");
    }

    function setGasPerGate(uint256 newValue) external onlyOwner {
        gasPerGate = newValue;
        emit GasPerGateUpdated(newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
