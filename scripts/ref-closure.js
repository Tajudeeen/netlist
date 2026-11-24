// Recursive TAP-02 REF-closure resolver.
// Circuit identities are deduplicated for unique-circuit reporting and
// attestation checks. REF occurrences are NOT deduplicated when calculating
// expanded evaluation work: referencing the same child twice evaluates two
// instances and contributes its gate/state count twice.

const { decodeTapNetlist } = require("../test/decoder");
const { Contract } = require("ethers");

const DEFAULT_MAX_CIRCUITS = 128;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_INSTANCES = 512;

function keyOf(processor, id) {
  return processor.toLowerCase() + ":" + BigInt(id).toString();
}

async function resolveClosure(provider, iface, processor, tokenId, opts = {}) {
  const maxCircuits = opts.maxCircuits ?? DEFAULT_MAX_CIRCUITS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxInstances = opts.maxInstances ?? DEFAULT_MAX_INSTANCES;
  const blockTag = opts.blockTag;

  if (!Number.isInteger(maxCircuits) || maxCircuits < 1 || maxCircuits > DEFAULT_MAX_CIRCUITS) {
    throw new Error(`maxCircuits must be between 1 and ${DEFAULT_MAX_CIRCUITS}`);
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > DEFAULT_MAX_DEPTH) {
    throw new Error(`maxDepth must be between 0 and ${DEFAULT_MAX_DEPTH}`);
  }
  if (!Number.isInteger(maxInstances) || maxInstances < 1 || maxInstances > DEFAULT_MAX_INSTANCES) {
    throw new Error(`maxInstances must be between 1 and ${DEFAULT_MAX_INSTANCES}`);
  }

  const unique = new Map();
  const active = new Set();
  let expandedInstanceCount = 0;

  async function load(cpu, id) {
    const key = keyOf(cpu, id);
    if (unique.has(key)) return unique.get(key);
    if (unique.size >= maxCircuits) throw new Error(`closure exceeded ${maxCircuits} unique circuits`);

    const proc = new Contract(cpu, iface, provider);
    const overrides = blockTag === undefined ? [] : [{ blockTag }];
    const [info, nl] = await Promise.all([
      proc.circuitInfo(id, ...overrides),
      proc.netlist(id, ...overrides),
    ]);
    const nIn = Number(info.nIn);
    const nOut = Number(info.nOut);
    const decoded = decodeTapNetlist(nl, nIn, nOut);
    const refs = decoded.records
      .filter((r) => r.op === 0x02)
      .map((r) => ({ cpu: r.cpu, id: r.id, nIns: r.inputs.length, nOuts: r.nOut }));

    const item = {
      key, processor: cpu, id: BigInt(id), nIn, nOut,
      nState: Number(info.nState),
      localGateCount: decoded.gateCount,
      reportedExpandedGateCount: Number(info.gateCount),
      localDepth: decoded.depth,
      hasRef: decoded.hasRef,
      refs,
    };
    unique.set(key, item);
    return item;
  }

  async function expand(cpu, id, depth) {
    if (depth > maxDepth) throw new Error(`REF depth exceeded ${maxDepth}`);
    if (++expandedInstanceCount > maxInstances) {
      throw new Error(`expanded REF instances exceeded ${maxInstances}`);
    }

    const item = await load(cpu, id);
    if (active.has(item.key)) throw new Error(`REF cycle detected at ${item.key}`);
    active.add(item.key);

    let expandedGateCount = item.localGateCount;
    let expandedStateCount = item.nState;
    let maxChildDepth = 0;

    for (const ref of item.refs) {
      const child = await load(ref.cpu, ref.id);
      if (child.nIn !== ref.nIns || child.nOut !== ref.nOuts) {
        throw new Error(
          `REF arity mismatch: ${item.key} -> ${child.key}, ` +
          `REF declares ${ref.nIns}/${ref.nOuts}, target has ${child.nIn}/${child.nOut}`
        );
      }
      const result = await expand(ref.cpu, ref.id, depth + 1);
      expandedGateCount += result.expandedGateCount;
      expandedStateCount += result.expandedStateCount;
      maxChildDepth = Math.max(maxChildDepth, result.maxRefDepth + 1);
      if (expandedGateCount > 0xffffffff || expandedStateCount > (1 << 24)) {
        throw new Error("TAP-02 expanded circuit size overflow");
      }
    }

    active.delete(item.key);
    return {
      expandedGateCount,
      expandedStateCount,
      maxRefDepth: maxChildDepth,
    };
  }

  const root = await expand(processor, tokenId, 0);
  const rootItem = unique.get(keyOf(processor, tokenId));
  if (root.expandedGateCount !== rootItem.reportedExpandedGateCount) {
    throw new Error(
      `TAP-02 gateCount mismatch: recursively expanded=${root.expandedGateCount}, ` +
      `processor reports=${rootItem.reportedExpandedGateCount}`
    );
  }

  return {
    uniqueCircuitCount: unique.size,
    expandedInstanceCount,
    expandedGateCount: root.expandedGateCount,
    expandedStateCount: root.expandedStateCount,
    maxRefDepth: root.maxRefDepth,
    circuits: [...unique.values()],
    blockTag,
  };
}

module.exports = { resolveClosure };
