# X Layer TapeOut Accelerate — Hackathon Intelligence Report

**Research/access date for every source below: 2026-11-20 (UTC)** unless a source states its own earlier publication date (noted where relevant).
**Primary source:** official OKX / X Layer event page `https://web3.okx.com/xlayer/build-x-series` — fetched successfully as server-side-rendered HTML via curl (HTTP 200, 105,498 bytes). Browser navigation to the same URL timed out; curl worked.
**Method:** direct HTTP retrieval of the official brief; GitHub REST API + `raw.githubusercontent.com` mining of public hackathon entries; OKX Help Center ToS; Google Form link resolution; DoraHacks and search-engine attempts (both blocked — see final section). No rule in this report is inferred from silence: absences are labelled as VERIFIED absence or explicitly flagged UNVERIFIED.

**Status legend:** **VERIFIED** = read on the named page on 2026-11-20. **SECONDARY** = a third-party repo reports it; consistent but not primary. **PLAUSIBLE** = reasonable inference, not stated by organizer. **UNVERIFIED** = could not confirm; needs organizer confirmation.

---

## 0. Source key (URL + access date; cited as [S#] throughout)

| ID | Source | URL | Accessed |
|---|---|---|---|
| S1 | **OFFICIAL** X Layer TapeOut Accelerate event page (Build X Series) | https://web3.okx.com/xlayer/build-x-series | 2026-11-20 |
| S2 | Participant repo (secondary) | https://github.com/melatim80186/tape-gate-xlayer | 2026-11-20 |
| S3 | Participant repo (secondary) | https://github.com/coral-fox-12/tapeout-proof-inference | 2026-11-20 |
| S4 | Participant repo + RESEARCH.md (secondary) | https://github.com/MSAbhishek22/tapeout-gate | 2026-11-20 |
| S5 | Participant repo (secondary) | https://github.com/naplex666/tapelock | 2026-11-20 |
| S6 | Participant repo (secondary) | https://github.com/Isaiah-54/tapelife-xlayer | 2026-11-20 |
| S7 | Participant repo (secondary; TapeOut docs links) | https://github.com/wahyunp56/tapeproof | 2026-11-20 |
| S8 | TapeOutProtocol/TAPs repo (specs, not the brief) | https://github.com/TapeOutProtocol/TAPs | 2026-11-20 |
| S9 | TapeOut protocol site (referenced by S1, not read in full here) | https://tapeout.net | linked 2026-11-20 |
| S10 | TapeKit repo (referenced, not the brief) | https://github.com/TapeOutProtocol/TapeKit | linked 2026-11-20 |
| S11 | X Layer hub | https://web3.okx.com/xlayer | 2026-11-20 |
| S12 | Official Google Form (short link on S1) | https://forms.gle/EoDNbxQ65dev1wFd9 | 2026-11-20 |
| S13 | Official Telegram support channel (link on S1) | https://t.me/+-7ouB60aYig2MmM1 | 2026-11-20 |
| S14 | TapeOut official X account (link on S1) | https://x.com/TapeOutWorld | 2026-11-20 |
| S15 | **OFFICIAL** X Layer Terms of Service (defines "Restricted Person") | https://web3.okx.com/help/x-layer-terms-of-service | 2026-11-20 |
| S16 | DoraHacks search (BLOCKED — human check) | https://dorahacks.io/hackathon?search=TapeOut | 2026-11-20 |
| S17 | GitHub repository search API (found 13+ public entries) | https://api.github.com/search/repositories?q=TapeOut+Accelerate | 2026-11-20 |
| S18 | OKX Help terms index (locator for S15) | https://web3.okx.com/help/category/terms-of-agreement | 2026-11-20 |
| S19 | Resolved Google Form URL (LOGIN-WALLED) | https://docs.google.com/forms/d/e/1FAIpQLScyVnDmyzxRyBxszLUWbwV5kVbpmZJ3JS6oyOxqjALRvhR1kg/viewform | 2026-11-20 |

---

## 1. Verdict on the inherited claims (from pre-existing README)

| Inherited claim | Verdict | Basis |
|---|---|---|
| Event is "X Layer TapeOut Accelerate" | **VERIFIED** | Exact heading and body title on S1. |
| Deadline Dec 7 2026 | **VERIFIED as published, but PROVISIONAL** | S1 states "December 7, 2026, at 23:59 UTC" in Requirements, FAQ and Terms §2 — but the same page twice calls it provisional (see §3). |
| Google Form asks for "processor contract address + circuit ID" | **VERIFIED as an official requirement** (exact wording: "Circuit projects must submit the processor contract address and circuit ID"), but the **exact form field labels are UNVERIFIED** because the form is sign-in gated [S19]. | S1 Requirements; S12/S19. |
| Video ≤ 3 min | **VERIFIED as a recommendation**, not a hard requirement — official text: "The recommended length is no more than three minutes." It is also listed as a judging criterion. | S1 Judging Criteria. |
| Prize pool 100,000 USDT | **VERIFIED** | S1 Prizes + Terms §6. |

---

## 2. Organizer, sponsor, judging panel, support channels

* **Organizer: X Layer.** **VERIFIED.** S1 Terms §1: "organized by X Layer (the 'Organizer')". Source: S1, accessed 2026-11-20.
* **Prize-pool sponsor: the TapeOut community.** **VERIFIED.** S1 Terms §6: "100,000 USDT prize pool sponsored by the TapeOut community." Source: S1, 2026-11-20.
* **Pool growth:** "The reward pool will continue to grow with additional contributions from TapeOut's founder, the TapeOut team and the community." **VERIFIED.** Source: S1, 2026-11-20.
* **A separate "Sponsor" is referred to in the disclaimer/terms but is not expressly named.** **PLAUSIBLE** that it means TapeOut / TapeOut community; confirm. Source: S1, 2026-11-20.
* **Judging panel:** "The official X Layer and TapeOut team will jointly evaluate entries and determine the final rankings." **VERIFIED.** Source: S1, 2026-11-20.
* **Support:** "For event inquiries and technical support, join our Telegram channel" → https://t.me/+-7ouB60aYig2MmM1 [S13]; "Learn more about TapeOut here" → https://x.com/TapeOutWorld [S14]. **VERIFIED.** Sources: S1/S13/S14, 2026-11-20.

---

## 3. Exact deadline, timezone, schedule

* **Event period:** "Oct 16 2026 – Dec 7, 2026, 23:59 UTC"; format "Online/Offline Demo Day." **VERIFIED.** Source: S1, 2026-11-20.
* **Published submission deadline: December 7, 2026, at 23:59 UTC.** Explicit **UTC**, no local-time ambiguity. **VERIFIED.** Source: S1 (Requirements, FAQ, Terms §2), 2026-11-20.
* **CRITICAL CAVEAT — the deadline is provisional.** FAQ: "This deadline is provisional; the official event page will confirm the final date." Terms §2: "The provisional submission deadline is December 7, 2026, at 23:59 UTC. Any changes will be announced on the Event page." Terms §13: Organizer may amend rules or schedule. **VERIFIED.** Sources: S1, 2026-11-20. → Treat Dec 7 23:59 UTC as the current published date, re-check S1 and S13 before submission.
* **Timezone conversions found in participant repos (SECONDARY, arithmetically consistent with 23:59 UTC Dec 7):** 05:29 IST on 8 Dec 2026 [S4]; 06:59 Vietnam/WIB on 8 Dec 2026 [S3][S5]. **PLAUSIBLE**, not from the organizer. Sources: S3/S4/S5, accessed 2026-11-20.

---

## 4. Tracks / directions

* **No formal named tracks and no per-track prizes are published on the official page.** **VERIFIED absence.** Source: S1, 2026-11-20.
* Official wording: "Eligible directions include, but are not limited to, apps, games, online services, developer tools, circuit design and projects exploring mechanisms such as PoD. Projects addressing real needs of Web2 and Web3 users are encouraged. Building on existing ecosystem tools and applications is welcome." **VERIFIED.** Source: S1, 2026-11-20.
* The site lists other Build X Series events (AI Season, OKX.AI Genesis, Hook x World Cup, X Cup season, Hook season) — these are **separate events, not tracks of TapeOut Accelerate**. **VERIFIED.** Source: S1, 2026-11-20.

---

## 5. Prize pools and payout terms

* **100,000 USDT total.** **VERIFIED.** S1 Prizes + Terms §6. Source: S1, 2026-11-20.
* **First prize (1 winner): 20,000 USDT; Second prize (5 winners): 10,000 USDT each; Third prize (5 winners): 6,000 USDT each.** (Sums exactly to 100,000 USDT.) **VERIFIED.** Source: S1, 2026-11-20.
* **Paid in stages**, after the event and eligibility verification, as winning teams work with X Layer and TapeOut; "Payment schedules, milestones and other terms will be agreed upon with each team." Winners also get "official X Layer PR support and collaboration opportunities," arranged separately, non-transferable and not cash-convertible, no guarantee of investment/commercial partnership. **VERIFIED.** Source: S1 Terms §6, 2026-11-20.
* **Prize amounts are before tax**; participants bear taxes/costs. **VERIFIED.** Source: S1 Terms §11, 2026-11-20.
* **Payout wallet:** winners must provide a self-custodial wallet; organizer/sponsor will never ask for private keys or recovery phrases. **VERIFIED.** Source: S1 Terms §7, 2026-11-20.

---

## 6. Eligibility

* **Age:** at least 18 or the legal age of majority in the participant's jurisdiction, whichever is higher, **or** legally established entities. **VERIFIED.** Source: S1 Terms §3, 2026-11-20.
* **Individuals and teams welcome**. **VERIFIED.** Source: S1 Requirements + Terms §3, 2026-11-20.
* **Restricted Persons under the X Layer Terms of Service are ineligible**; organizer may verify eligibility and require winners to complete identity checks. **VERIFIED.** Source: S1 Terms §3, 2026-11-20.
* **Definition (from the incorporated ToS):** "Restricted Location"/"Prohibited Jurisdiction" includes, **but may not be limited to**, Cuba, Iran, North Korea, and the Crimea, Donetsk, Sevastopol and Luhansk regions of Ukraine, plus any country/region subject to Singapore, EU, UK or US embargo/sanctions, or designated high-risk/non-cooperative by an intergovernmental body such as the FATF. "Restricted Person" covers citizens/residents/entities of those locations, sanctioned parties (incl. OFAC SDN list), and owned/controlled parties. **VERIFIED.** Source: S15 (`https://web3.okx.com/help/x-layer-terms-of-service`), accessed 2026-11-20. Note the list is explicitly non-exhaustive; India and Vietnam are **not** named, but country-specific eligibility is still **UNVERIFIED** — ask the organizer [S13].
* **Existing projects ARE eligible** but must include "substantial new development completed during the event" and describe what was added; "only work completed during the Event will be judged." **VERIFIED.** Source: S1 Requirements, FAQ, Terms §5, 2026-11-20.
* **Must use X Layer:** "Your project must use TapeOut circuits, contracts or onchain data on X Layer and provide the relevant addresses. Interfaces and other components do not need to be deployed onchain." **VERIFIED.** Source: S1 FAQ, 2026-11-20.
* **No need to deploy your own processor:** "You may build using existing TapeOut processors, circuits and developer tools." **VERIFIED.** Source: S1 FAQ, 2026-11-20.
* **No need to be generating revenue yet:** explain target users, problem, proposed revenue model. **VERIFIED.** Source: S1 FAQ, 2026-11-20.
* **Compliance:** participants and recipient wallets must satisfy applicable laws, sanctions and regional restrictions; organizer may request verification and suspend/refuse payment. **VERIFIED.** Source: S1 Terms §8, 2026-11-20.

---

## 7. Judging criteria and weights

Five named criteria, with official descriptions (**all VERIFIED**, source: S1 Judging Criteria, accessed 2026-11-20):

1. **User Value and Commercial Potential** — "A clear understanding of real user needs and target markets, with potential for long-term growth and sustainable operations." (The README of [S3] calls this "the #1 judging criterion" — **SECONDARY/UNVERIFIED**; no ranking is stated on S1.)
2. **Innovation** — "Originality in circuit design, product features, or user experience, as well as the potential to expand TapeOut into new use cases."
3. **Ecosystem Integration** — "Effective use of TapeOut or ecosystem capabilities such as DeWEB, FabX, TapeCode, TapeKit, and TapeSend to create meaningful product value. The use of any specific project or tool is not required."
4. **Product Readiness and User Experience** — "Functional core features, a complete user journey, and a reduced technical barrier for users."
5. **Demo Video** — "The recommended length is no more than three minutes. It should cover the problem being solved, a demonstration of the core features, the target users and business model, and how the project uses TapeOut or related ecosystem tools."

* **NO WEIGHTS OR PERCENTAGES are published.** **VERIFIED absence on S1**; whether internal weights exist is **UNVERIFIED**. Source: S1, 2026-11-20.
* **Inconsistency to flag:** Terms §5 lists the criteria as "user value and commercial potential, innovation, ecosystem use, product completeness and user experience" — it **omits Demo Video** while the Judging Criteria section includes it. **VERIFIED.** Source: S1, 2026-11-20. Ask the organizer which list governs [S13].
* **Ecosystem Integration expressly does not require any specific project/tool.** **VERIFIED.** Source: S1, 2026-11-20.

---

## 8. Required / encouraged technology

* **Mandatory (official):** build within the TapeOut ecosystem and "either use TapeOut circuits, contracts, or onchain data on X Layer, or run on X Layer DeWEB"; provide relevant addresses. **VERIFIED.** Source: S1 Requirements + FAQ, 2026-11-20.
* **Encouraged ecosystem capabilities named by the organizer:** **DeWEB, FabX, TapeCode, TapeKit, TapeSend** — "the use of any specific project or tool is not required." **VERIFIED.** Source: S1, 2026-11-20.
* **Eligible directions:** apps, games, online services, developer tools, circuit design, PoD mechanisms; real Web2/Web3 needs encouraged; building on existing ecosystem tools/apps welcome. **VERIFIED.** Source: S1, 2026-11-20.
* **Not all functionality must be on-chain / in a circuit:** "Interfaces, computation and other features may run outside circuits. Explain which features use TapeOut in your project description." **VERIFIED.** Source: S1 FAQ, 2026-11-20.
* **TapeOut technical background (SECONDARY, from participant READMEs, not the official brief):** TapeOut canvas, TapeCode (AI circuit-dev tool), TapeAPI (`https://github.com/brucelanlan/tapeapi` cited as v3.0.0, 2026-11-06), TapeKit, `tapeoutdaily.ai`, `giang.me/tapeout`, TapeOut manifesto PDF on `tapeout.net`. Sources: S7, S3, 2026-11-20. Treat as **PLAUSIBLE** until checked at the primary docs. TAP specs (TAP-02 netlist format, TAP-10) are in S8 (**VERIFIED that the repo exists and hosts numbered TAPs**, accessed 2026-11-20).

---

## 9. Submission format

* **Channel = Google Form**, link on S1: https://forms.gle/EoDNbxQ65dev1wFd9 [S12], which resolves to `https://docs.google.com/forms/d/e/1FAIpQLScyVnDmyzxRyBxszLUWbwV5kVbpmZJ3JS6oyOxqjALRvhR1kg/viewform` [S19]. **VERIFIED** (link + resolution), 2026-11-20. Deadline: Dec 7 2026, 23:59 UTC (**provisional** — see §3).
* **Circuit projects:** "must submit the processor contract address and circuit ID." **VERIFIED.** Source: S1, 2026-11-20. (**Inherited claim confirmed.**)
* **Websites, apps and tools:** "must provide an access link and explain which TapeOut ecosystem projects or features they use." **VERIFIED.** Source: S1, 2026-11-20.
* **All entries:** "submit your project description and relevant addresses or links through the submission form." **VERIFIED.** Source: S1 FAQ, 2026-11-20.
* **Required description content:** product or service; target users and how to reach them; proposed revenue model; why users would pay and keep using the product. Circuit/tool/mechanism projects may instead explain the use cases and commercial applications they support. **VERIFIED.** Source: S1 Requirements + Terms §4, 2026-11-20.
* **Demo video:** recommended ≤ 3 minutes; should cover problem, core-feature demonstration, target users and business model, and TapeOut/ecosystem usage. **VERIFIED as recommendation.** Source: S1, 2026-11-20.
* **NOT stated on the official brief:** any requirement for a public GitHub repo, a hosted live demo URL for circuit/tool projects, a specific field for contract addresses of non-circuit projects, or a separate written submission PDF. **VERIFIED absence** → see ambiguities §11. Source: S1, 2026-11-20.
* **Form fields could NOT be read:** both curl (HTTP 401) and browser (redirect to Google sign-in) were blocked at [S19]. Exact field names, whether a video URL upload/link is required, and any team-detail fields are **UNVERIFIED**. Sources: S12/S19, accessed 2026-11-20.

---

## 10. Sponsor resources / support

* Prize pool and its growth contributions — see §5. **VERIFIED** (S1).
* "Winners will also receive official X Layer PR support and collaboration opportunities, with details arranged separately. These benefits cannot be transferred or exchanged for cash and do not guarantee investment or a commercial partnership." **VERIFIED.** Source: S1 Terms §6, 2026-11-20.
* Telegram technical support [S13] and TapeOut X account [S14]. **VERIFIED.** Sources: S1/S13/S14, 2026-11-20.
* **Format:** online hackathon; shortlisted teams attend an offline Demo Day. **VERIFIED** that this is stated; **UNVERIFIED** for date, venue, travel or stipend. Source: S1, 2026-11-20.
* **No sponsor resource kit** (API credits, grants, cloud/tool vouchers, mentorship roster) is enumerated in the official brief. **VERIFIED absence.** Source: S1, 2026-11-20.

---

## 11. Restrictions on AI use, pre-existing code, open source, IP

* **AI use: no explicit restriction or disclosure requirement appears in the official brief.** **VERIFIED absence.** Note the site has a *separate* "AI Season" event (Aug 7–21 2026) that is not this hackathon. **PLAUSIBLE** that AI-assisted development is allowed, but **confirm in Telegram [S13]**. Source: S1, 2026-11-20.
* **Pre-existing code:** existing projects are allowed only with "substantial new development completed during the event"; additions must be described; "only work completed during the Event will be judged." **VERIFIED.** Source: S1 Requirements/FAQ/Terms §5, 2026-11-20.
* **Open source: no requirement to open-source the entry and no prohibition on using open-source code is stated.** **VERIFIED absence.** Source: S1, 2026-11-20.
* **Rights warranty:** "Participants retain ownership of their entries and must hold the necessary rights to all included code, assets and other content. Submission grants the Organizer a worldwide, non-exclusive, royalty-free, irrevocable license solely to operate, judge, showcase, promote and report on the Event." **VERIFIED.** Source: S1 Terms §9, 2026-11-20.
* **Misconduct/disqualification:** "Plagiarism, unauthorized use of code or assets, fabricated functionality or data, impersonation, manipulation of judging, and other unlawful or fraudulent conduct may result in disqualification or loss of an award." **VERIFIED.** Source: S1 Terms §10, 2026-11-20. (This is the clause that makes AI/code provenance worth confirming.)
* **Third-party tools:** TapeOut and ecosystem projects are third-party protocols/tools; participants bear the risk; organizer not liable for interruptions/vulnerabilities/losses. **VERIFIED.** Source: S1 Disclaimer §4, 2026-11-20.
* **Community licence facts (SECONDARY, not rules of the hackathon):** TAPs texts CC0, example code MIT [S8]; TapeKit MIT [S7/S10]. **PLAUSIBLE**; verify at source if relying on reused code.

---

## 12. Ambiguities needing organizer confirmation (via S13 Telegram)

1. **Is Dec 7 2026 23:59 UTC final?** The page calls it *provisional* in both FAQ and Terms §2. Check S1 and ask in S13 immediately before submission. (S1, 2026-11-20)
2. **Judging weights:** none published. Are the five criteria equally weighted? Is "Demo Video" actually scored, and is the ≤3 min video mandatory or only recommended? (S1, 2026-11-20)
3. **Which criteria list governs** — the 5-item Judging Criteria section (includes Demo Video) or Terms §5 (omits it)? (S1, 2026-11-20)
4. **"Tracks":** the page gives illustrative "eligible directions," not named tracks. Any category-specific award or prize split? (S1, 2026-11-20)
5. **Exact Google Form fields** — the form is sign-in gated [S19]. Does it explicitly request processor contract address + circuit ID, a demo-video link, a repo link, team details? (S1/S12/S19, 2026-11-20)
6. **Is a public GitHub repo required?** Not stated on S1. Ask before assuming either way. (S1, 2026-11-20)
7. **Circuit projects:** which exact address is the "processor contract address" (processor vs factory vs container), and what is the expected format of the "circuit ID"? (S1, 2026-11-20)
8. **Non-circuit projects:** what exactly counts as "relevant addresses or links"? (S1, 2026-11-20)
9. **Demo Day logistics:** date, city/venue, travel support, and what "shortlisted" means. (S1, 2026-11-20)
10. **Prize milestones:** the payout schedule is "agreed upon with each team" — ask for typical milestone terms and timing. (S1, 2026-11-20)
11. **AI/pre-existing code disclosure:** no published rule; confirm whether AI-generated code or reused open-source must be disclosed to avoid Terms §10 disputes. (S1, 2026-11-20)
12. **Country eligibility:** ToS "Restricted Location" list is non-exhaustive; get explicit confirmation for the team's jurisdictions (e.g. India, Vietnam). (S15/S1, 2026-11-20)
13. **"Sponsor" identity:** disclaimers refer to a Sponsor but only the TapeOut community is named as prize sponsor. (S1, 2026-11-20)

---

## 13. Sources checked, blocked, and limitations

| Source | Result |
|---|---|
| Official event page S1 | **SUCCESS** via curl SSR HTML (all rules above read directly). Browser navigation timed out. |
| X Layer ToS S15 (found via S18) | **SUCCESS** via curl; "Restricted Person" definition read directly. |
| GitHub repo search S17 | **SUCCESS** — 13+ public "X Layer TapeOut Accelerate" entries found, confirming the event name and that many teams treat S1 as the brief. |
| raw.githubusercontent READMEs/RESEARCH.md S2–S7 | **SUCCESS** — secondary corroboration only; used to flag ambiguities, never as primary rules. |
| GitHub org endpoint `https://api.github.com/orgs/TapeOutProtocol/repos` | **404 "Not Found"** — no org at that exact name; repos exist at `TapeOutProtocol/TAPs` and `TapeOutProtocol/TapeKit`. |
| Google Form S12 → S19 | **BLOCKED** — HTTP 401 via curl; browser redirected to Google sign-in. Form ID resolved; fields unread. |
| DoraHacks S16 | **BLOCKED** — "Let's confirm you are human" challenge in browser; curl returned HTML with no TapeOut Accelerate event records. **No official DoraHacks event page found.** The official submission route is the Google Form, not DoraHacks. |
| DuckDuckGo HTML search | **BLOCKED** — "Select all squares containing a duck" bot challenge. |
| Bing via curl | Returned irrelevant X (Twitter) results for "X Layer" queries; no usable SERP. |
| tapeout.net S9, TapeKit S10, TAPs S8 | Linked/located; **not fully read in this pass** — protocol docs, not the hackathon brief. Any technical rule attributed to them is SECONDARY. |

**Bottom line:** the official brief **was found and read in full** at S1. The only material items that remain genuinely unverified are the Google Form's exact field labels, judging weights, the finality of the provisional deadline, and organizer positions on AI/open-source disclosure — all listed in §12 for direct confirmation via S13.
