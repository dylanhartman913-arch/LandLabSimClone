# Comparison notes (LL-50)

Every set of LL-10 headline outcomes committed in `docs/comparisons/headlines.json` needs a note here, under a heading that carries its digest. `npm run test:comparisons` fails when a headline moves without one; `npm run test:comparisons -- --update` regenerates the reports and headlines and opens a stub listing what changed. Replace its `TODO` with what changed and why the new outcomes are right. Newest first below the stubs is fine; the check only looks for the digest.

Headlines, per profile, comparison, variant and weather: runs with a departure, median survival-short days, median lowest wellbeing, median end cash (nearest $100) and median home-grown share (nearest %).

## 066c221e57b1 — engine 0.25.0

Why: the first committed baseline (LL-50), for both profiles: new-game rules, and new-game rules with every experimental mechanic on.

- **New-game rules:** no headline changed since the October 25 Phase 9B regeneration. The report itself had drifted: tutorial gifts are worth $3,273, not $3,248, because Phase 10 catalog rows changed a reward item's market price. That is the gap this check closes.
- **Every experimental mechanic on** (first run): every route keeps everyone home except one: in Laramie, booking a paid crew for the late heater (rescue/crew) sends the household to town for 15 days in both Standard and Real seed 1, although the heater finishes on day 148 instead of the household's day 210. Lowest wellbeing 74 there; one survival-short day across most routes (two for late winter prep and the yurt replacement); home-grown food 12–13% against 19–22% under new-game rules; part-time work clears $35,400 because transport access pays its commute. Worth a look before any of these mechanics become a default.
