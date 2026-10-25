# Phase 9 controlled comparisons

Run with `node --import tsx packages/cli/bots/phase9.ts`. Two adults, greenfield, 365 days, remote-job tutorial route. Standard seed 1 and Real seeds 1–3 at each site. Wear and trade remain opt-in. Numbers below are game balance experiments.

Variants: baseline; wear only; trade only (weekly surplus orders, keep 28 household-days of each food resource); same trade policy plus a purchased Farm Stand on day 30. No prepared Food resale. No barter: it requires tutorial completion and a player-selected exchange. The stand adds its purchase, construction, staffing and transport costs. Policies only place a stand when affordable and a valid spot exists.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | Cash end | Trade receipts | Sold units* | Repairable condition min |
|---|---|---|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | baseline | 0 | 75.2 | 58049.51 | 0.00 | 0.00 | — |
| front-range | standard/1 | wear | 0 | 75.2 | 58049.51 | 0.00 | 0.00 | 0.7187 |
| front-range | standard/1 | trade | 0 | 75.2 | 58049.51 | 0.00 | 0.00 | — |
| front-range | standard/1 | stand | 0 | 75.2 | 56933.64 | 0.00 | 0.00 | — |
| front-range | real/1 | baseline | 0 | 75.2 | 57700.36 | 0.00 | 0.00 | — |
| front-range | real/1 | wear | 0 | 75.2 | 57700.36 | 0.00 | 0.00 | 0.7187 |
| front-range | real/1 | trade | 0 | 75.2 | 57700.36 | 0.00 | 0.00 | — |
| front-range | real/1 | stand | 0 | 75.2 | 56464.72 | 0.00 | 0.00 | — |
| front-range | real/2 | baseline | 0 | 75.2 | 57614.44 | 0.00 | 0.00 | — |
| front-range | real/2 | wear | 0 | 75.2 | 57614.44 | 0.00 | 0.00 | 0.7187 |
| front-range | real/2 | trade | 0 | 75.2 | 57614.44 | 0.00 | 0.00 | — |
| front-range | real/2 | stand | 0 | 75.2 | 56534.05 | 0.00 | 0.00 | — |
| front-range | real/3 | baseline | 0 | 75.2 | 57026.85 | 0.00 | 0.00 | — |
| front-range | real/3 | wear | 0 | 75.2 | 57026.85 | 0.00 | 0.00 | 0.7187 |
| front-range | real/3 | trade | 0 | 75.2 | 57026.85 | 0.00 | 0.00 | — |
| front-range | real/3 | stand | 0 | 75.2 | 55747.33 | 0.00 | 0.00 | — |
| laramie-wy | standard/1 | baseline | 0 | 75.2 | 57249.45 | 0.00 | 0.00 | — |
| laramie-wy | standard/1 | wear | 0 | 75.2 | 57249.45 | 0.00 | 0.00 | 0.7187 |
| laramie-wy | standard/1 | trade | 0 | 75.2 | 57249.45 | 0.00 | 0.00 | — |
| laramie-wy | standard/1 | stand | 0 | 75.2 | 56428.20 | 0.00 | 0.00 | — |
| laramie-wy | real/1 | baseline | 0 | 75.2 | 57013.80 | 0.00 | 0.00 | — |
| laramie-wy | real/1 | wear | 0 | 75.2 | 57013.80 | 0.00 | 0.00 | 0.7187 |
| laramie-wy | real/1 | trade | 0 | 75.2 | 57013.80 | 0.00 | 0.00 | — |
| laramie-wy | real/1 | stand | 0 | 75.2 | 56145.57 | 0.00 | 0.00 | — |
| laramie-wy | real/2 | baseline | 0 | 75.2 | 57080.69 | 0.00 | 0.00 | — |
| laramie-wy | real/2 | wear | 0 | 75.2 | 57080.69 | 0.00 | 0.00 | 0.7187 |
| laramie-wy | real/2 | trade | 0 | 75.2 | 57080.69 | 0.00 | 0.00 | — |
| laramie-wy | real/2 | stand | 0 | 75.2 | 56390.77 | 0.00 | 0.00 | — |
| laramie-wy | real/3 | baseline | 0 | 75.2 | 56114.07 | 0.00 | 0.00 | — |
| laramie-wy | real/3 | wear | 0 | 75.2 | 56114.07 | 0.00 | 0.00 | 0.7187 |
| laramie-wy | real/3 | trade | 0 | 75.2 | 56114.07 | 0.00 | 0.00 | — |
| laramie-wy | real/3 | stand | 0 | 75.2 | 55316.07 | 0.00 | 0.00 | — |
| asheville-nc | standard/1 | baseline | 0 | 75.2 | 59880.82 | 0.00 | 0.00 | — |
| asheville-nc | standard/1 | wear | 0 | 75.2 | 59880.82 | 0.00 | 0.00 | 0.7187 |
| asheville-nc | standard/1 | trade | 0 | 75.2 | 59880.82 | 0.00 | 0.00 | — |
| asheville-nc | standard/1 | stand | 0 | 75.2 | 59647.89 | 0.00 | 0.00 | — |
| asheville-nc | real/1 | baseline | 0 | 75.2 | 59955.07 | 0.00 | 0.00 | — |
| asheville-nc | real/1 | wear | 0 | 75.2 | 59955.07 | 0.00 | 0.00 | 0.7187 |
| asheville-nc | real/1 | trade | 0 | 75.2 | 59955.07 | 0.00 | 0.00 | — |
| asheville-nc | real/1 | stand | 0 | 75.2 | 59723.25 | 0.00 | 0.00 | — |
| asheville-nc | real/2 | baseline | 0 | 75.2 | 59925.63 | 0.00 | 0.00 | — |
| asheville-nc | real/2 | wear | 0 | 75.2 | 59925.63 | 0.00 | 0.00 | 0.7187 |
| asheville-nc | real/2 | trade | 0 | 75.2 | 59925.63 | 0.00 | 0.00 | — |
| asheville-nc | real/2 | stand | 0 | 75.2 | 59703.20 | 0.00 | 0.00 | — |
| asheville-nc | real/3 | baseline | 0 | 75.2 | 59889.99 | 0.00 | 0.00 | — |
| asheville-nc | real/3 | wear | 0 | 75.2 | 59889.99 | 0.00 | 0.00 | 0.7187 |
| asheville-nc | real/3 | trade | 0 | 75.2 | 59889.99 | 0.00 | 0.00 | — |
| asheville-nc | real/3 | stand | 0 | 75.2 | 59650.21 | 0.00 | 0.00 | — |

*Sold units are a diagnostic sum across canonical units, not a nutrition or economic measure. Receipts are gross; cash end includes collection and stand costs. No defaults are changed by this experiment.

## Controlled harvest and worn-panel checks

These isolate the mechanics the first-year route rarely exercises: the same 500 lb harvest stock, one adult and eight prebuilt bikes at each site; one sale of 300 lb after three warm-up days. A stand is bought for $200 and built using household labor. Separately, a panel begins at 15% condition; the repair variant pays catalog parts and uses actual construction labor. No unlimited supply. Compare each pair within its own fixture.

| Site | Experiment | Trade receipts | Collection cost | Cash end | 30-day electricity (kWh) | Construction hours |
|---|---|---:|---:|---:|---:|---:|
| front-range | Market sale | 1200 | 0 | 101200.00 | — | 0.00 |
| front-range | Stand sale | 1920 | 0 | 101720.00 | — | 1.00 |
| front-range | Worn panel | — | — | 100000.00 | 39.20 | 0.00 |
| front-range | Repair panel | — | — | 99900.00 | 76.78 | 1.00 |
| laramie-wy | Market sale | 1200 | 0 | 101200.00 | — | 0.00 |
| laramie-wy | Stand sale | 1920 | 0 | 101720.00 | — | 1.00 |
| laramie-wy | Worn panel | — | — | 100000.00 | 42.99 | 0.00 |
| laramie-wy | Repair panel | — | — | 99900.00 | 84.24 | 1.00 |
| asheville-nc | Market sale | 1200 | 0 | 101200.00 | — | 0.00 |
| asheville-nc | Stand sale | 1920 | 0 | 101720.00 | — | 1.00 |
| asheville-nc | Worn panel | — | — | 100000.00 | 34.43 | 0.00 |
| asheville-nc | Repair panel | — | — | 99900.00 | 67.36 | 1.00 |