# LL-38 risk-event comparisons

Reproduce with `node --import tsx packages/cli/bots/risks.ts`. Experimental game balance; defaults unchanged. Matched 365-day runs across three sites, Standard seed 1 and Real seeds 1–3, for the greenfield remote-job and adapt-upgrader routes. Wear, livestock lifecycle and Finance are enabled in both variants; only `riskEvents` differs. Bots keep their existing decisions and do not react to new warnings. This measures exposure, not an optimized risk-response policy. Independent risk draws leave the climate and predator streams unchanged.

| Route | Site | Weather/seed | Risk gate | Survival short days | Min wellbeing | End cash | Warnings | Starts | Smoke days | Road-closure days | Outage days |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield | front-range | standard/1 | off | 0 | 75.2 | 57267 | 0 | 0 | 0 | 0 | 0 |
| greenfield | front-range | standard/1 | on | 0 | 75.2 | 57267 | 2 | 2 | 0 | 3 | 0 |
| greenfield | front-range | real/1 | off | 0 | 75.2 | 57016 | 0 | 0 | 0 | 0 | 0 |
| greenfield | front-range | real/1 | on | 0 | 75.2 | 57014 | 2 | 2 | 0 | 3 | 0 |
| greenfield | front-range | real/2 | off | 0 | 75.2 | 56881 | 0 | 0 | 0 | 0 | 0 |
| greenfield | front-range | real/2 | on | 0 | 75.2 | 55643 | 6 | 6 | 5 | 6 | 0 |
| greenfield | front-range | real/3 | off | 0 | 75.2 | 56296 | 0 | 0 | 0 | 0 | 0 |
| greenfield | front-range | real/3 | on | 0 | 75.2 | 55162 | 3 | 3 | 5 | 0 | 0 |
| greenfield | laramie-wy | standard/1 | off | 0 | 75.2 | 56266 | 0 | 0 | 0 | 0 | 0 |
| greenfield | laramie-wy | standard/1 | on | 0 | 75.2 | 56261 | 2 | 2 | 0 | 3 | 0 |
| greenfield | laramie-wy | real/1 | off | 0 | 75.2 | 56154 | 0 | 0 | 0 | 0 | 0 |
| greenfield | laramie-wy | real/1 | on | 0 | 75.2 | 56153 | 2 | 2 | 0 | 3 | 0 |
| greenfield | laramie-wy | real/2 | off | 0 | 75.2 | 56169 | 0 | 0 | 0 | 0 | 0 |
| greenfield | laramie-wy | real/2 | on | 0 | 75.2 | 56025 | 5 | 5 | 5 | 9 | 0 |
| greenfield | laramie-wy | real/3 | off | 0 | 75.2 | 55150 | 0 | 0 | 0 | 0 | 0 |
| greenfield | laramie-wy | real/3 | on | 0 | 75.2 | 54925 | 4 | 4 | 5 | 3 | 0 |
| greenfield | asheville-nc | standard/1 | off | 0 | 75.2 | 58809 | 0 | 0 | 0 | 0 | 0 |
| greenfield | asheville-nc | standard/1 | on | 0 | 75.2 | 58809 | 2 | 2 | 0 | 0 | 0 |
| greenfield | asheville-nc | real/1 | off | 0 | 75.2 | 58741 | 0 | 0 | 0 | 0 | 0 |
| greenfield | asheville-nc | real/1 | on | 0 | 75.2 | 58741 | 2 | 2 | 0 | 0 | 0 |
| greenfield | asheville-nc | real/2 | off | 0 | 75.2 | 58466 | 0 | 0 | 0 | 0 | 0 |
| greenfield | asheville-nc | real/2 | on | 0 | 75.2 | 58447 | 4 | 4 | 5 | 0 | 0 |
| greenfield | asheville-nc | real/3 | off | 0 | 75.2 | 58662 | 0 | 0 | 0 | 0 | 0 |
| greenfield | asheville-nc | real/3 | on | 0 | 75.2 | 58443 | 4 | 4 | 5 | 0 | 0 |
| adapt | front-range | standard/1 | off | 0 | 75.8 | 17878 | 0 | 0 | 0 | 0 | 0 |
| adapt | front-range | standard/1 | on | 4 | 75.8 | 17893 | 7 | 7 | 0 | 3 | 10 |
| adapt | front-range | real/1 | off | 0 | 75.8 | 17909 | 0 | 0 | 0 | 0 | 0 |
| adapt | front-range | real/1 | on | 4 | 75.8 | 17924 | 7 | 7 | 0 | 3 | 10 |
| adapt | front-range | real/2 | off | 0 | 75.8 | 17820 | 0 | 0 | 0 | 0 | 0 |
| adapt | front-range | real/2 | on | 8 | 75.8 | 17834 | 9 | 8 | 5 | 6 | 4 |
| adapt | front-range | real/3 | off | 0 | 75.8 | 17872 | 0 | 0 | 0 | 0 | 0 |
| adapt | front-range | real/3 | on | 0 | 75.8 | 17872 | 6 | 6 | 5 | 0 | 6 |
| adapt | laramie-wy | standard/1 | off | 0 | 75.8 | 17230 | 0 | 0 | 0 | 0 | 0 |
| adapt | laramie-wy | standard/1 | on | 4 | 75.8 | 17244 | 7 | 7 | 0 | 3 | 10 |
| adapt | laramie-wy | real/1 | off | 0 | 75.8 | 17282 | 0 | 0 | 0 | 0 | 0 |
| adapt | laramie-wy | real/1 | on | 4 | 75.8 | 17296 | 7 | 7 | 0 | 3 | 10 |
| adapt | laramie-wy | real/2 | off | 0 | 75.8 | 17151 | 0 | 0 | 0 | 0 | 0 |
| adapt | laramie-wy | real/2 | on | 12 | 75.8 | 16904 | 8 | 7 | 5 | 9 | 4 |
| adapt | laramie-wy | real/3 | off | 0 | 75.8 | 17223 | 0 | 0 | 0 | 0 | 0 |
| adapt | laramie-wy | real/3 | on | 4 | 75.8 | 17229 | 7 | 7 | 5 | 3 | 6 |
| adapt | asheville-nc | standard/1 | off | 0 | 75.8 | 18366 | 0 | 0 | 0 | 0 | 0 |
| adapt | asheville-nc | standard/1 | on | 0 | 75.8 | 18372 | 7 | 7 | 0 | 0 | 10 |
| adapt | asheville-nc | real/1 | off | 0 | 75.8 | 18383 | 0 | 0 | 0 | 0 | 0 |
| adapt | asheville-nc | real/1 | on | 0 | 75.8 | 18390 | 7 | 7 | 0 | 0 | 10 |
| adapt | asheville-nc | real/2 | off | 0 | 75.8 | 18325 | 0 | 0 | 0 | 0 | 0 |
| adapt | asheville-nc | real/2 | on | 0 | 75.8 | 18323 | 7 | 6 | 5 | 0 | 4 |
| adapt | asheville-nc | real/3 | off | 0 | 75.8 | 18359 | 0 | 0 | 0 | 0 | 0 |
| adapt | asheville-nc | real/3 | on | 0 | 75.8 | 18359 | 7 | 7 | 5 | 0 | 6 |

## Controlled mitigations

Fixed event schedules isolate each effect. Validation supply is used for garden/repair/refuge/well production tests, so missing inputs cannot masquerade as an event effect; road and grid checks use ordinary supply. These are game scenarios, not empirical hazard forecasts.

| Risk | Scenario | Result |
|---|---|---|
| pests | No operating defense | 0.059 lb harvest/day |
| pests | Operating defense within 10 ft | 0.100 lb harvest/day |
| disease | No operating defense | 0.059 lb harvest/day |
| disease | Operating defense within 10 ft | 0.100 lb harvest/day |
| breakdown | No repair, insured | End condition 0.000; insurance paid $440.00; averted false |
| breakdown | Repair during warning | End condition 0.997; insurance paid $0.00; averted true |
| smoke | No operating refuge | 1.500 air-exposure wellbeing points/day before difficulty; cooling demand adds 8 CDD |
| smoke | Operating enclosed home | 0.375 air-exposure wellbeing points/day before difficulty; cooling demand adds 8 CDD |
| blizzard | No food reserve | Food delivered 0 kcal in 3 days; delivery spending $0.00 |
| blizzard | Stored food reserve | Food delivered 6000 kcal in 3 days; delivery spending $0.00 |
| outage | Grid only | Electricity produced 0.00 kWh; grid purchased 0.00 kWh |
| outage | Fueled portable generator | Electricity produced 2.57 kWh; grid purchased 0.00 kWh |
| drawdown | No drawdown | Water produced 196.15 gal/day |
| drawdown | Depleted wells; rain collection unchanged | Water produced 89.36 gal/day |

Predator warning, guardian/secure-housing mitigation and losses remain the LL-31 mechanism; the LL-38 regression checks its draws and results match with this gate off/on. No second predator lottery is added.
