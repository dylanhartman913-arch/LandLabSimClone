# Comparison notes (LL-50)

Every set of LL-10 headline outcomes committed in `docs/comparisons/headlines.json` needs a note here, under a heading that carries its digest. `npm run test:comparisons` fails when a headline moves without one; `npm run test:comparisons -- --update` regenerates the reports and headlines and opens a stub listing what changed. Replace its `TODO` with what changed and why the new outcomes are right. Newest first below the stubs is fine; the check only looks for the digest.

Headlines, per profile, comparison, variant and weather: runs with a departure, median survival-short days, median lowest wellbeing, median end cash (nearest $100) and median home-grown share (nearest %).

## 066c221e57b1 — engine 0.25.0

Why: the first committed baseline (LL-50), for both profiles: new-game rules, and new-game rules with every experimental mechanic on.

- **New-game rules:** no headline changed since the October 25 Phase 9B regeneration. The report itself had drifted: tutorial gifts are worth $3,273, not $3,248, because Phase 10 catalog rows changed a reward item's market price. That is the gap this check closes.
- **Every experimental mechanic on** (first run): every route keeps everyone home except one: in Laramie, booking a paid crew for the late heater (rescue/crew) sends the household to town for 15 days in both Standard and Real seed 1, although the heater finishes on day 148 instead of the household's day 210. Lowest wellbeing 74 there; one survival-short day across most routes (two for late winter prep and the yurt replacement); home-grown food 12–13% against 19–22% under new-game rules; part-time work clears $35,400 because transport access pays its commute. Worth a look before any of these mechanics become a default.

## 33909405469a — engine 0.28.0

Why: LL-58 changes the tutorial route used by every comparison: missing construction Soil is imported free, so the unnecessary 24 lb purchase is gone; planting assistance waits for both active crop systems and the compost reserve, and subsequent assistance waits for the visible supply/work settings. These change purchase traffic, construction contention, reward timing and operating history. The comparison decisions, catalog, weather rules and survival thresholds were not tuned. Existing saved seasonal tutorials retain the old route; new games opt into `tutorialInstructions`.

The resulting 30 changed headlines are recorded below. Under new-game rules, departure counts, survival-short days and minimum wellbeing do not worsen; most changes are cash rounding ($100–$400), with two one-point annual home-grown share changes. Under all experimental mechanics, the intentionally late Laramie heater is sensitive to that changed operating history: in a paired Standard probe toggling only `tutorialInstructions`, household-built late heat completes on day 160 under the old line, versus day 174 after a day-149 departure under the corrected line (absolute simulation days). Accordingly winter/late and rescue/household move from 0/3 to 1/3 departures in Standard and 0/9 to 1/9 in Real. The Real crew variant moves from 1/9 to 0/9. The Standard crew departure remains unchanged. This records a risk of deliberately postponing heat with all mechanics enabled, not a reason to change balance in this copy/validation ticket. The default tutorial has independent, explicit completion and no-departure assertions on all six sites for two and four adults.

- new-game tutorial/off/standard: left 0/3, short 0, min WB 75, cash end $5,400, grown 17% → left 0/3, short 0, min WB 75, cash end $5,300, grown 17%
- new-game job/remote/standard: left 0/3, short 0, min WB 75, cash end $58,000, grown 21% → left 0/3, short 0, min WB 75, cash end $58,100, grown 21%
- new-game job/remote/real: left 0/9, short 0, min WB 75, cash end $57,600, grown 21% → left 0/9, short 0, min WB 75, cash end $57,700, grown 21%
- new-game shelter/yurt-replace/standard: left 0/3, short 1, min WB 75, cash end $3,000, grown 21% → left 0/3, short 1, min WB 75, cash end $3,100, grown 21%
- new-game storage/storage-first/standard: left 0/3, short 0, min WB 75, cash end $8,600, grown 21% → left 0/3, short 0, min WB 75, cash end $8,700, grown 21%
- new-game storage/storage-first/real: left 0/9, short 0, min WB 75, cash end $8,600, grown 21% → left 0/9, short 0, min WB 75, cash end $8,700, grown 21%
- new-game storage/crops-first/standard: left 0/3, short 0, min WB 75, cash end $8,600, grown 22% → left 0/3, short 0, min WB 75, cash end $8,600, grown 21%
- new-game winter/early/real: left 0/9, short 0, min WB 75, cash end $8,500, grown 20% → left 0/9, short 0, min WB 75, cash end $8,500, grown 19%
- new-game winter/late/standard: left 0/3, short 1, min WB 75, cash end $8,400, grown 20% → left 0/3, short 1, min WB 75, cash end $8,500, grown 20%
- new-game winter/late/real: left 0/9, short 1, min WB 75, cash end $8,400, grown 19% → left 0/9, short 1, min WB 75, cash end $8,500, grown 19%
- new-game rescue/household/standard: left 0/3, short 1, min WB 75, cash end $8,400, grown 20% → left 0/3, short 1, min WB 75, cash end $8,500, grown 20%
- new-game rescue/household/real: left 0/9, short 1, min WB 75, cash end $8,400, grown 19% → left 0/9, short 1, min WB 75, cash end $8,500, grown 19%
- new-game rescue/crew/standard: left 0/3, short 1, min WB 75, cash end $7,300, grown 20% → left 0/3, short 1, min WB 75, cash end $7,400, grown 20%
- new-game rescue/crew/real: left 0/9, short 1, min WB 75, cash end $7,300, grown 19% → left 0/9, short 1, min WB 75, cash end $7,400, grown 19%
- new-game stacking/one/standard: left 0/3, short 0, min WB 75, cash end $58,000, grown 21% → left 0/3, short 0, min WB 75, cash end $58,100, grown 21%
- new-game stacking/one/real: left 0/9, short 0, min WB 75, cash end $57,600, grown 21% → left 0/9, short 0, min WB 75, cash end $57,700, grown 21%
- new-game stacking/three/real: left 0/9, short 0, min WB 75, cash end $72,800, grown 20% → left 0/9, short 0, min WB 75, cash end $73,200, grown 20%
- experimental tutorial/off/standard: left 0/3, short 1, min WB 75, cash end $4,300, grown 10% → left 0/3, short 1, min WB 75, cash end $4,500, grown 10%
- experimental tutorial/off/real: left 0/9, short 1, min WB 75, cash end $4,300, grown 10% → left 0/9, short 1, min WB 75, cash end $4,500, grown 10%
- experimental job/part/real: left 0/9, short 1, min WB 75, cash end $35,400, grown 13% → left 0/9, short 1, min WB 75, cash end $35,300, grown 13%
- experimental job/remote/real: left 0/9, short 1, min WB 75, cash end $58,600, grown 13% → left 0/9, short 1, min WB 75, cash end $58,500, grown 13%
- experimental shelter/yurt-replace/real: left 0/9, short 2, min WB 75, cash end $1,900, grown 13% → left 0/9, short 2, min WB 75, cash end $2,000, grown 13%
- experimental winter/late/standard: left 0/3, short 2, min WB 74, cash end $7,600, grown 13% → left 1/3, short 2, min WB 74, cash end $7,600, grown 13%
- experimental winter/late/real: left 0/9, short 2, min WB 74, cash end $7,600, grown 12% → left 1/9, short 2, min WB 74, cash end $7,600, grown 12%
- experimental rescue/household/standard: left 0/3, short 2, min WB 74, cash end $7,600, grown 13% → left 1/3, short 2, min WB 74, cash end $7,600, grown 13%
- experimental rescue/household/real: left 0/9, short 2, min WB 74, cash end $7,600, grown 12% → left 1/9, short 2, min WB 74, cash end $7,600, grown 12%
- experimental rescue/crew/real: left 1/9, short 2, min WB 74, cash end $6,500, grown 12% → left 0/9, short 2, min WB 74, cash end $6,500, grown 12%
- experimental stacking/one/real: left 0/9, short 1, min WB 75, cash end $58,600, grown 13% → left 0/9, short 1, min WB 75, cash end $58,500, grown 13%
- experimental stacking/three/standard: left 0/3, short 1, min WB 75, cash end $79,300, grown 13% → left 0/3, short 1, min WB 75, cash end $79,700, grown 13%
- experimental stacking/three/real: left 0/9, short 1, min WB 75, cash end $78,200, grown 13% → left 0/9, short 1, min WB 75, cash end $78,700, grown 13%
