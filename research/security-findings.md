# Security / supply-chain findings (2026-11-20)

Evidence gathered while applying the `hardhat-contract-dev` and
`hackathon-research-ideation` skills. Labels follow the latter's
VERIFIED / PLAUSIBLE / UNVERIFIED convention.

## VERIFIED — hardcoded fallback private key removed

- **Finding (VERIFIED):** `hardhat.config.js` contained
  `const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "11".repeat(32)`.
  With no `.env`, the deploy scripts would sign with a bogus but valid key
  instead of failing loudly. The `hardhat-contract-dev` skill explicitly
  forbids this pattern.
- **Fix (VERIFIED):** config now reads `process.env.PRIVATE_KEY` with no
  fallback; `scripts/deploy.js` checks it explicitly.
- **Reproduce:** `node scripts/deploy.js xlayerTestnet` with no key prints
  `Error: PRIVATE_KEY is not set. Copy .env.example to .env and add a funded deployer key.`
  The config still loads from plain Node (`accounts[0] === undefined`) and
  `node scripts/deploy.js` with no args prints its usage line, not HH5.

## VERIFIED — dependency vulnerabilities are dev-tooling

- `npm audit --json` reports 69 vulnerabilities: 5 critical, 31 high,
  14 moderate, 19 low.
- Critical packages: `cipher-base`, `elliptic`, `pbkdf2`, `sha.js`, `webpack`.
- High packages include `@nomicfoundation/hardhat-toolbox`,
  `@nomicfoundation/hardhat-ignition*`, `@trufflesuite/uws-js-unofficial`,
  `adm-zip`, `brace-expansion`, `braces`.
- **Classification (PLAUSIBLE):** these arrive through Hardhat 2.x / Ganache
  dev dependencies. The deployed contracts do not import npm code at runtime
  and the dashboard loads no npm bundle, so the exploitability is confined to
  the build/test host. This is not a deployed-contract risk.
- **Action:** NOT auto-upgraded. `npm audit fix --force` would change Hardhat
  major versions and can break the verified build/test path. Action should be
  decided after the official hackathon brief is available (AI-use, allowed
  tooling and reproducibility rules may constrain it). Re-run
  `npm audit --json` before submission and record the result.

## VERIFIED — no research artifacts existed in repo before this pass

`find . -maxdepth 2` for `research|hackathon|intelligence|prd|architect|risk|
demo_plan|decision|open_question|security` returned nothing. The
`hackathon-research-ideation` skill's quality gate requires official event
requirements before design approval; an evidence-led research pass is now
underway and its output lives under `research/`.
