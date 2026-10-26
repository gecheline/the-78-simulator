# Open questions: status as of Oct 26, 2026

Answers to the eight open questions in the prototype spec, from the Data Sandbox documents and public sources.

## Answered by research and in the data now

**Should the mayor's senior adviser be a separate node?** Yes. Jason Lee, a senior mayoral adviser, publicly defended the TIF garage as a platform for later housing and towers (Chicago Sun-Times, Jun 17 2026). That is a documented role in The 78, so `mayor_adviser` is its own node, tagged *Press*. Two corrections to the spec:
- The "TIF quote, Mar 2026" is actually Mayor Johnson's: "All of that is being worked through" (Borderless, Mar 3 2026). It sits on the Mayor's office node.
- The adviser's quote is from June 2026, not March.

**Who is the Ward 25 alderperson?** Ald. Byron Sigcho-Lopez. He was the only alderperson to vote against both parts of the July 2026 TIF package, and he asked for more community feedback first (WTTW, Jul 13 2026). He is node `sigcho`, tagged *Press*, stance *objects*.

**Tract-to-community-area table.** Done. `scripts/vulnerability.mjs` downloads the 2010 tract → community area table from the Chicago Data Portal (dataset 74p9-q2aq). It caches the table in `data/raw/`, joins 2,129 of 2,165 Tree Equity block groups, and writes a population-weighted vulnerability index per area to `data/areas.json`:

| Area | Index |
| --- | --- |
| 31 Lower West Side | 0.54 |
| 33 Near South Side | 0.35 |
| 34 Armour Square | 0.67 |
| 60 Bridgeport | 0.61 |

The index averages four citywide percentiles: poverty, linguistic isolation, dependents and heat. Each segment's vulnerability is its area index plus a tenure adjustment. The index is tagged documented; the tenure adjustment is synthetic. Caveat: Near South Side matches only 3 tracts, because its 2020 tracts were split differently.

**Spending near the site (The Battery vs spread).** Not settled by evidence, so it's now a live slider ("Spending spillover to Chinatown", default 0.35) instead of a fixed sign. At 0 the tenant-business weight is −0.4 (spending stays on site, as at The Battery). At 1 it is +0.4.

## Big change found during research

The TIF terms were approved on **Jul 15, 2026**: up to $424.9M, including a **city-owned ~1,200-space below-grade garage**, Metra track upgrades, river wall work and open space (DPD releases, Jun 17 and Jul 15 2026). As a result:
- The "parking garage" preset is no longer hypothetical. It is labeled *Approved Jul 2026*, and its window shows as closed.
- The "Agreement / TIF terms" stage is marked passed. Still open are later-phase site plan reviews, affordable housing compliance plans, river permits, a CBA or ordinance, and land trust acquisitions.
- Step 5 of the demo path needs rewording. The zoning votes **and the TIF deal** have passed; permits, later phases and an ordinance are still open.
- New node: **CBA for The 78 Coalition** (CBCAC, Lugenia Burns Hope Center, People Matter). It is pushing for an ordinance that includes a binding CBA.

## Still open: needs people, not research

- **Chinatown land trust: who and how far along?** No public record found (searched Oct 2026). It stays *Interview* evidence, and its node says it is unconfirmed. Ask the interviewee.
- **Power direction per tie type.** Proposed defaults are in `data/tie_types.json`. Review them with the room using Tab 1 → *Power assumptions*, which recomputes live. Choices worth arguing about:
  - `pressures` and `claims_voice` give the presser only ½ and ¼ standing.
  - `negotiates` splits standing between both sides.
  - `appoints` is a new type, needed for the mayor → Plan Commission and DPD ties.
- **Chinatown segments and their signs.** Check with workshop participants from Chinatown before the demo.
- **Comparable-case citations.** Every case card except Woodlawn links to a general reference and carries a "Citation needs review" flag. Replace those with primary sources in `data/cases.json` and set `citation_status` to `"cited"`.
- **Affordable housing figures.** The conflicting figures the spec mentions aren't in the sandbox documents, so that scenario stays fully synthetic.
