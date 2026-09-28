# Engine

`packages/engine` is pure TypeScript: no React, PixiJS, DOM, `Math.random()`, or `Date.now()` (ESLint enforces this, and `test/purity.test.ts` proves the rule fires). It has two modes over one catalog:

- **Balance mode** answers "on average, does this design cover a household?" It is the spreadsheet's math and must reproduce the spreadsheet exactly.
- **Time mode** answers "does it actually work in February of a dry year?" (see the time section below).

## Provenance

Every number the engine returns is an `Explained`:

```ts
interface Explained { value: number; explain: Explain }
interface Explain {
  formula: string;                 // plain language
  terms: Term[];                   // flow-level contributions, spreadsheet row order
  refs?: Record<string, number>;   // named intermediates (provided, needed, …)
  assumptions?: AssumptionKey[];   // site values this number depends on
  notes?: string[];
}
interface Term { flowId; systemId; count; qty; period; factor; needFactor?; value }
```

Provenance is built while computing, never reconstructed afterwards. For any checklist cell, `Σ term.qty × term.factor × term.count × (term.needFactor ?? 1)` equals the value (tested).

## Balance mode

```ts
balance(catalog, assumptions, design: { counts: Record<SystemId, number> }): BalanceResult
```

### Quantities and periods

- `evalQty(flow, system, assumptions)` evaluates the flow's `QtyExpr` (see `docs/CATALOG.md`) in the spreadsheet's left-to-right order, e.g. heat load = `((area × loss-factor × HDD) × 24) ÷ 52`.
- `weeklyEquivalent(qty, period)` = `qty × timesPerYear ÷ 52`. `Per season` uses *Growing seasons per year*; `One-time` is 0; `Capacity` is 1.

### Formulas (each mirrors a spreadsheet column)

| Output | Formula | Sheet |
|---|---|---|
| Flow weekly total | `(qty × weekly factor) × count` | Flows!J |
| Contribution to need | `weekly total × Resources factor` | Flows!L |
| Resource produced / consumed | `Σ weekly totals` of output / input flows | Resources!I, J |
| Resource net | `produced − consumed` | Resources!K |
| Resource status | Ambient → Site-supplied; both 0 → Not in design; `net < −0.0001·max(consumed,1)` → Deficit; `net > 0.0001·max(produced,1)` → Surplus; else Balanced | Resources!L |
| Checklist provided / needed | `Σ contributions` of output / input flows whose resource feeds the row | Needs Checklist!C, D |
| % covered | `needed = 0 ? 0 : min(1, provided ÷ needed)` | Needs Checklist!E |
| Covered? | `needed = 0 ? n/a : % ≥ 1 ? ✓ : ✗` | Needs Checklist!F |
| Overall score | mean % over rows with `needed > 0` (0 if none) | Needs Checklist!B3 |
| Systems placed | `Σ counts − humans − Σ counts of zero-footprint systems whose category is exactly Land` | Design Summary!B6 |
| Costs, setup labor, land used | `Σ per-system value × count` (cheapest = min(buy, DIY), buy if no DIY) | B8-B10, B14 |
| Labor available / required | checklist Labor row provided / needed | B11-B12 |
| Land available; water, battery, food storage; capital in/out; wellbeing | Σ weekly totals of the named resource's outputs (inputs for capital out) | B13, B16, B18, B20-B22, B24 |
| Days of water | `water storage ÷ ((Water need + Drinking water need) ÷ 7)`, 0 if no need | B17 |
| Days of battery | `battery kWh ÷ (Electricity need ÷ 7)`, 0 if no need | B19 |
| Resources in deficit | count of status = Deficit | B25 |

Sums walk flows in spreadsheet row order (system by system; the exporter's row order is system-contiguous, and the engine falls back to sorting terms by row if it is not) so floating-point sums follow `SUMIFS`.

### Parity contract

`test/parity.test.ts` runs `balance` on the counts saved in the xlsx (`goldens.json`) and asserts every per-flow quantity and weekly equivalent, every checklist cell, the overall score, every Design Summary metric, and every Resources balance row within 1e-9 relative (absolute floor 1e-9). A parity failure is an engine bug by definition; never edit the golden.

Handoff numbers for the starter design: overall score 48.5%, Heated shelter need 697,846 BTU/wk, Food 4,979 of 16,000 kcal/wk.

### Regression digests

`designs/` holds four designs (`starter`, `offgrid-cabin-family`, `suburban-baseline`, `tent-and-nothing`). `test/balance-designs.test.ts` hashes each balance result (values only, 12 significant digits, FNV-1a 64) against `test/digests.json`. After an intended change, rerun with `UPDATE_DIGESTS=1` and record why in the build log.

### Performance

1,000 balance calls on a 200-instance design: ~75-110 ms in Node (budget 200 ms). Per-catalog lookups (flows by system, formula strings, frozen results for untouched resources) are cached in a `WeakMap` keyed by the catalog object.
