# Audit: G11–G16 on `claude/gifted-hypatia-x158zw`

Audited 2026-10-01 at `0484e63` (the last G16 commit). This audit only verifies and fixes CI or commit hygiene. It does not add features or tune anything.

## Summary

| # | Check | Result |
|---|---|---|
| 1 | CI doesn't depend on this sandbox's tools; `catalog:check` passes on a fresh runner | **Pass** |
| 2a | Re-recorded time digests in their own commit | **Partial**: documented in a follow-up commit; history not rewritten (see below) |
| 2b | Spreadsheet-parity goldens: existing entries unchanged since before G11 | **Pass** (the file isn't byte-identical: the source hash changed and 21 flows were added) |
| 3a | Workbook recalculated in LibreOffice: overall score still 48.5%; checklist matches `goldens.json` | **Pass** |
| 3b | The G15 patch added rows only and changed no existing cell | **Pass, with one qualification**: 872 existing formulas had their range end extended from row 169 to 177. No typed value changed. |
| 3c | Table of the eight new systems | Below |

**Commits made by this audit:**
- `d1c5485`: `packages/engine/test/DIGESTS.md`, the digest history.
- `60229fc`: `docs/CATALOG.md` note that the patch script is manual-only; a comment on the CI step.
- This report, and a build-log entry.

No engine, data, catalog, or test file was changed.

---

## 1. CI and the catalog patch script

**What calls the script.** Searched `.github/workflows/*.yml`, every `package.json`, `scripts/`, and all TS/JS sources for `catalog_patch`, `soffice`, `libreoffice`, `openpyxl`, and `python`:
- Only `scripts/catalog_patch.py` itself mentions them.
- No workflow job and no npm script calls the patch script or recalculates the workbook.
- The three tests that spawn processes (`time-invariants`, `montecarlo`, `e2e/decision`) spawn Node, not Python.

**How the check reads the workbook.** `npm run catalog:check` (`packages/catalog/src/cli/check.ts`) re-exports in memory and diffs the result against the committed files. The exporter reads the xlsx with SheetJS (`xlsx@0.18.5` from npm, `workbook.ts`): `c.v` is the cached value, `c.f` the formula text. It never recalculates. `pages.yml` runs the same check.

**Proof in a clean environment:**
- Fresh `git clone` of the branch into a scratch directory, then `npm ci` (245 packages).
- Then every non-browser CI step, under `env -i` with `PATH` holding only `node`, `npm`, `npx`, and `sh`. `command -v soffice` and `command -v python3` both reported not found.

| Command | Exit | Output |
|---|---|---|
| `npm run catalog:check` | 0 | `catalog:check: generated files match data/source and data/catalog_overrides.json` |
| `npm run typecheck` | 0 | |
| `npm run lint` | 0 | |
| `npm test` | 0 | 27 files, **218 / 218** passed |
| `npm run test:pacing` | 0 | `All pacing gates pass.` (5 gates × 3 sites × 3 seeds) |

The e2e and Lighthouse steps weren't rerun in this audit; the build log reports 44 of 44 e2e at `0484e63`. CI installs their browser with `npx playwright install --with-deps chromium`, which doesn't depend on this sandbox.

**Change:** `docs/CATALOG.md` now says the patch script is run by hand only and stays out of CI, and the CI step carries a one-line comment saying the same (`60229fc`). No install steps were added, because none are needed.

## 2. Digests and goldens

### 2a. Time digests

`packages/engine/test/digests.json` was changed in four feature commits:

| Commit | Digests changed |
|---|---|
| `2ec5579` (G11–G12) | all three `time:*` |
| `4e06287` (G14) | `time:starter`, `time:offgrid-cabin-family` |
| `ac41a6e` (G15) | all three `time:*` |
| `55622ac` (G16) | all three `time:*` |

The `balance:*` digests haven't changed since G10.

**Which G16 fix moved which digest.** I checked out `55622ac` in the scratch clone, reverted each fix alone, and ran `UPDATE_DIGESTS=1 npx vitest run packages/engine/test/time-invariants.test.ts -t "committed one-year digest"`:

| Variant at `55622ac` | `time:starter` | `time:offgrid-cabin-family` | `time:suburban-baseline` |
|---|---|---|---|
| All fixes (committed) | `597405555e09f6e0` | `8e5b69da0f8d529c` | `4d8464032212228c` |
| Upkeep back to priority 3 | same | same | `06a4d2d355f6ba34` (the G15 value) |
| Flow boosts back to reading services | `b68f73296d744388` (G15) | `bb1a900eb08f3884` (G15) | same |
| Seed reserve off | same | same | same |
| Running costs not recorded | same | same | same |
| Upkeep and boosts both reverted | `b68f73296d744388` | `bb1a900eb08f3884` | `06a4d2d355f6ba34`: exactly G15 |

So:
- Upkeep priority changed only the suburban digest.
- Flow boosts changed the starter and off-grid cabin digests.
- The seed reserve and the bills fix changed no digest. The G16 build-log line says the digests were re-recorded "for upkeep priority 1, Flow boosts, and the seed reserve", but the seed reserve didn't move them.

**Why history wasn't rewritten.** Separating the digest edits into their own commit would mean rebasing six pushed commits and force-pushing. The branch is on `origin`, and I can't tell whether anyone has pulled it, so I followed the brief's fallback: a follow-up commit (`d1c5485`) adds `packages/engine/test/DIGESTS.md`. That note gives every value with its cause, and the commit message lists each fix with old and new values. No digest value was changed.

### 2b. Spreadsheet-parity goldens

I compared `packages/catalog/generated/goldens.json` at `e497963` (the last pre-G11 commit) with HEAD:
- **Only `f2baf9a` (G15) touched it.**
- **Not byte-identical.** sha256 before `6d79ec46…`, after `17c09241…`. The only differences:
  - `source.sha256`: `b8d81357…` → `e0996b51…`, the xlsx's own hash.
  - 21 added keys, `flows.F0798` … `flows.F0818`.
- **Every pre-existing entry is identical:**
  - a recursive comparison with exact equality, type included;
  - `git diff` shows the hash line as the only removed line.

  That covers `schemaVersion`, `counts`, `humans`, `overallScore`, `checklist`, `summary`, `resources`, and the 797 existing `flows`.
- **Parity tests.** `parity.test.ts` changed only by the rename `balance` → `balancePotential`, and its assertions are untouched. A global replace also renamed two test titles awkwardly ("matches every Resources balancePotential row"). That's cosmetic, and left as is.

## 3. The workbook

### 3a. Recalculation

LibreOffice 24.2.7.2 ran headless with a fresh profile set to always recalculate OOXML on load (`OOXMLRecalcMode=0`), converting to xlsx. I compared the results with openpyxl (`data_only=True`).

**Is it really recalculating?** I also saved a copy through openpyxl first, which strips every cached value (`Needs Checklist!B3` read `None`), then recalculated that copy. That one can only have values if LibreOffice computed them.

| Comparison | Non-empty formula results compared | Differences |
|---|---|---|
| HEAD cached vs LibreOffice recalculation of HEAD | 7,094 | 0 |
| HEAD cached vs recalculation of the stripped copy | 7,094 | 0 |
| Pre-G15 file (Excel-saved) cached vs its LibreOffice recalculation | 6,914 | 0 |

The tolerance was 1e-9 relative.

**Results:**
- Needs Checklist overall score (`B3`) = **0.485028917841418 (48.5%)**. That equals `goldens.overallScore`, and `humans` (`B2`) = 1 equals `goldens.humans`.
- Checklist rows 6–16 were compared with exact equality against `goldens.checklist` on provided, needed, %, covered, need, and unit: 66 of 66 values match.
- Design Summary rows 5–25 match `goldens.summary`.

### 3b. Only rows were added

I compared HEAD with the pre-G15 workbook (`4e06287`, blob sha256 `b8d81357…`, the same as `01dc61a`), using my own script rather than the patch script's summary. Each cell's formula text (or typed value) and its cached value were compared:

| Check | Result |
|---|---|
| Existing cells removed | 0 |
| Typed (non-formula) values changed | **0** |
| Formula text changed other than in row numbers | **0** |
| Formula text changed in row numbers only | 872 cells: Flows 841, Categories 25, Design Summary 5, Needs Checklist 1 |
| Row-number rewrites | 1,807 references, every one `169 → 177`: `Systems!$X$2:$X$169` range ends extended over the new rows |
| New cells outside Systems rows 170–177, Flows rows 799–819, Matrix rows 170–177 | 0 |
| Cached values changed | 25. These are the same 25 that `docs/catalog_patches/g15-diff.md` lists: 14 Resources producer/user counts (F, G) and 11 Categories cells. |
| Sheets, frozen panes, merged cells, tables, defined names | unchanged |

**Qualifications:**
- **"Changed no existing cell" holds for values, not for formula text.** 872 formulas were rewritten, but only to extend their range end. Without that, the totals would ignore the new rows.
- **One changed value isn't a count.** `g15-diff.md` says every changed value is a count. `Categories!E3` ("Within target?" for Shelter) is a derived flag that went `Yes` → `No`, because the retrofit's Shelter tag makes 21 systems. The build log's "For the user to check" does mention it.
- **Validation and formatting ranges weren't extended.** The Systems data validation on `R2:R169` ("Count in design") and the Matrix conditional formatting on `B2:BK169` stop at row 169. In Excel, rows 170–177 get no validation and no highlight. This is cosmetic: the exporter ignores both. Not fixed: it would be a workbook change, which is outside this audit.
- **The file is now LibreOffice-saved.** The patch script re-saves the whole workbook through LibreOffice, and the pre-G15 file was saved by Excel. Cell content is identical, as shown above, but styling details such as fonts, column widths, and theme colors may differ. Worth a look when you open it in Excel.
- **Row numbers aren't IDs.** Systems rows 170–177 hold IDs S169–S176, and Flows rows 799–819 hold F0798–F0818, because row 1 is the header.

### 3c. The eight new systems

Values are from the recalculated workbook. All have Count in design = 0, so none affects the starter design or the goldens' checklist.

| Row | ID | System | Categories | Buy / DIY $ | Setup h | Upkeep h/wk | Footprint sq ft | Flows (row: direction resource qty unit period) |
|---|---|---|---|---|---|---|---|---|
| 170 | S169 | Rain Barrel (55 gal) | Water-System; Storage | 120 / 60 | 1 | 0.1 | 4 | 799: in Labor 0.1 hours Weekly · 800: in Rainfall `=Assumptions!$C$8/52` (0.2885 in) Weekly · 801: out Water, the rain-capture formula (catchment 100 sq ft × rain × gal/sq ft-in × 0.8 = 14.377 gal) Weekly · 802: out Water storage 55 gal Capacity |
| 171 | S170 | Pellet Mill (small) | Biomass; Energy | 2,500 / — | 4 | 2 | 16 | 803: in Labor 2 hours Weekly · 804: in Wood chips 120 lbs Weekly · 805: in Electricity 15 kWh Weekly · 806: out Wood pellets 100 lbs Weekly |
| 172 | S171 | Part-Time Job (20 hrs) | Conventional | 0 / — | 0 | 0 | 0 | 807: in Labor 20 hours Weekly · 808: in Transportation 75 miles Weekly · 809: out Capital 575 $ Weekly |
| 173 | S172 | Remote Job (40 hrs) | Conventional | 0 / — | 0 | 0 | 0 | 810: in Labor 40 hours Weekly · 811: out Capital 1,000 $ Weekly |
| 174 | S173 | Sheet-Mulch Lawn Conversion (500 sq ft) | Garden | 400 / 100 | 6 | 0.25 | 500 | 812: in Labor 0.25 hours Weekly · 813: in Carbon 100 lbs One-time · 814: in Compost 200 lbs One-time · 815: out Soil 40 cu ft Per season |
| 175 | S174 | Home Weatherization Retrofit | Shelter; Heating | 3,000 / 1,200 | 30 | 0.05 | 0 | 816: in Labor 0.05 hours Weekly. Its heat effect (host shelter's heat × 0.7) is an engine modifier in `catalog_overrides.json`, not a flow. |
| 176 | S175 | Suburban Lot (1/4 acre) | Land | 100,000 / — | 0 | 0 | 0 | 817: out Land area 10,890 sq ft Capacity |
| 177 | S176 | Clothesline | Tools | 40 / 15 | 1 | 0.5 | 20 | 818: in Labor 0.5 hours Weekly · 819: out Wellbeing 2 points Weekly. Its electricity saving (people's electricity × 20/21) is an engine modifier. |

Matrix rows 170–177 hold the same eight systems.

## Found, not fixed

1. **There is no `main` branch on GitHub.** The remote has only `claude/gifted-hypatia-x158zw`, and every commit from the spreadsheet onward is on it. A PR "to main" needs a `main` to exist first; see the PR description for how that was handled.
2. **The G16 build log overstates the seed reserve's effect on digests** (§2a). Left as written: the build log is a historical record, and this report corrects it.
3. **Data validation and conditional formatting stop at row 169** (§3b). That's a workbook change, out of scope.
4. **`g15-diff.md` calls every changed value a count**, but `Categories!E3` is a flag (§3b). The file is generated by the patch script, and I didn't regenerate it.
5. **Four of the five pacing gates are seed-invariant.**
   - Under Standard and Gentle difficulty, the game uses average weather and nothing else draws on the RNG. So seeds 1, 2, and 3 give identical results, and "3 seeds × 3 sites" is effectively 1 seed for those gates.
   - Only the Real weather gate varies by seed. I checked this: seeds 1–3 draw different years (precipitation × 1.24 / 0.88 / 0.86, one with a 28-day late frost, one with a heat wave).
   - It isn't a bug, but the gates prove less than the table suggests. Not changed: it's a design matter.
6. **One test assertion was loosened.** In `time-invariants.test.ts`, the cabin's average health went from `< 0.5` to `< 0.6`, because wellbeing v2 puts the labor floor at 0.5 (`labor = 0.5 + 0.5 × wellbeing`). The change is consistent with the new model, but it is a weaker assertion. Flagged for review, not changed.
7. **Parity test titles were renamed by a global replace** (§2b). Cosmetic.

## Open design question (for the user; not acted on)

**Greenfield's "clothes and bedding count against the cold" is a hidden engine constant.**

- **Where it lives:** `HEAT_BEDDING_HDD = 20` in `packages/engine/src/time/wellbeing.ts:56`.
- **Where it's used:**
  - `updatePeople` in `packages/engine/src/time/step.ts:1005`: heat for wellbeing is delivered ÷ (needed × (HDD − 20) ÷ HDD);
  - `heatShareAfterBedding` in `packages/engine/src/tutorial.ts:40`, the "warm" quest goal.
- **Where it's documented:** `docs/ENGINE.md` ("Heat and bedding") and `docs/BALANCE_LOG.md`.
- **What it isn't:** it isn't an item, a stockpile entry, or a catalog row. It applies to every household in time mode, not only greenfield.

**Do the "why" popovers show it? No.**
- A person's "why" shows `Heat: N% met`, and N is already net of bedding. On a day bedding covers in full, the heat term is dropped, because only non-zero terms are kept.
- No string in `apps/web/src` mentions bedding.
- The checklist's Heated shelter row uses the full need, without bedding. So the checklist can read, say, 25% heat while the people bar reports heat as met, and nothing on screen explains the gap. Under CLAUDE.md rule 4 (every number explainable), that is worth a decision.

**Options:**
- **(a)** Keep the constant and add a "Clothes and bedding cover the first 20 °F-days" term to the heat "why".
- **(b)** Make bedding a visible starter-kit item with a Heat output, through a catalog patch.
- **(c)** Make it a site or start setting.

Option (b) would put it under spreadsheet parity, and is the most honest about where the heat comes from.
