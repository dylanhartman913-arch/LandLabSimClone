# LL-37 finance comparisons

Reproduce with `node --import tsx packages/cli/bots/finance.ts`. Experimental game balance; defaults unchanged. Two adults on the greenfield remote-job route for 365 days. Standard seed 1 and Real seeds 1–3 at each site. Variants: legacy; finance with no debt or insurance; finance with a $2,000 opening draw and insurance. The last variant deliberately keeps the loan outstanding to show its cost. Cash less debt is shown separately so borrowed cash cannot look like income.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Debt | Cash less debt and tax due | Tax paid | Interest paid | Premiums | Claims | Reserve target |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | legacy | 0 | 75.2 | 58050 | 0 | 58050 | 0 | 0 | 0 | 0 | 0 |
| front-range | standard/1 | finance | 0 | 75.2 | 57950 | 0 | 57950 | 100 | 0 | 0 | 0 | 0 |
| front-range | standard/1 | credit+insured | 0 | 75.2 | 59530 | 2000 | 57530 | 100 | 240 | 180 | 0 | 0 |
| front-range | real/1 | legacy | 0 | 75.2 | 57700 | 0 | 57700 | 0 | 0 | 0 | 0 | 0 |
| front-range | real/1 | finance | 0 | 75.2 | 57600 | 0 | 57600 | 100 | 0 | 0 | 0 | 0 |
| front-range | real/1 | credit+insured | 0 | 75.2 | 59180 | 2000 | 57180 | 100 | 240 | 180 | 0 | 0 |
| front-range | real/2 | legacy | 0 | 75.2 | 57614 | 0 | 57614 | 0 | 0 | 0 | 0 | 0 |
| front-range | real/2 | finance | 0 | 75.2 | 57514 | 0 | 57514 | 100 | 0 | 0 | 0 | 0 |
| front-range | real/2 | credit+insured | 0 | 75.2 | 59094 | 2000 | 57094 | 100 | 240 | 180 | 0 | 0 |
| front-range | real/3 | legacy | 0 | 75.2 | 57027 | 0 | 57027 | 0 | 0 | 0 | 0 | 0 |
| front-range | real/3 | finance | 0 | 75.2 | 56927 | 0 | 56927 | 100 | 0 | 0 | 0 | 0 |
| front-range | real/3 | credit+insured | 0 | 75.2 | 58507 | 2000 | 56507 | 100 | 240 | 180 | 0 | 0 |
| laramie-wy | standard/1 | legacy | 0 | 75.2 | 57249 | 0 | 57249 | 0 | 0 | 0 | 0 | 0 |
| laramie-wy | standard/1 | finance | 0 | 75.2 | 57149 | 0 | 57149 | 100 | 0 | 0 | 0 | 0 |
| laramie-wy | standard/1 | credit+insured | 0 | 75.2 | 58729 | 2000 | 56729 | 100 | 240 | 180 | 0 | 0 |
| laramie-wy | real/1 | legacy | 0 | 75.2 | 57014 | 0 | 57014 | 0 | 0 | 0 | 0 | 0 |
| laramie-wy | real/1 | finance | 0 | 75.2 | 56914 | 0 | 56914 | 100 | 0 | 0 | 0 | 0 |
| laramie-wy | real/1 | credit+insured | 0 | 75.2 | 58494 | 2000 | 56494 | 100 | 240 | 180 | 0 | 0 |
| laramie-wy | real/2 | legacy | 0 | 75.2 | 57081 | 0 | 57081 | 0 | 0 | 0 | 0 | 0 |
| laramie-wy | real/2 | finance | 0 | 75.2 | 56981 | 0 | 56981 | 100 | 0 | 0 | 0 | 0 |
| laramie-wy | real/2 | credit+insured | 0 | 75.2 | 58561 | 2000 | 56561 | 100 | 240 | 180 | 0 | 0 |
| laramie-wy | real/3 | legacy | 0 | 75.2 | 56114 | 0 | 56114 | 0 | 0 | 0 | 0 | 0 |
| laramie-wy | real/3 | finance | 0 | 75.2 | 56014 | 0 | 56014 | 100 | 0 | 0 | 0 | 0 |
| laramie-wy | real/3 | credit+insured | 0 | 75.2 | 57594 | 2000 | 55594 | 100 | 240 | 180 | 0 | 0 |
| asheville-nc | standard/1 | legacy | 0 | 75.2 | 59881 | 0 | 59881 | 0 | 0 | 0 | 0 | 0 |
| asheville-nc | standard/1 | finance | 0 | 75.2 | 59781 | 0 | 59781 | 100 | 0 | 0 | 0 | 0 |
| asheville-nc | standard/1 | credit+insured | 0 | 75.2 | 61361 | 2000 | 59361 | 100 | 240 | 180 | 0 | 0 |
| asheville-nc | real/1 | legacy | 0 | 75.2 | 59955 | 0 | 59955 | 0 | 0 | 0 | 0 | 0 |
| asheville-nc | real/1 | finance | 0 | 75.2 | 59855 | 0 | 59855 | 100 | 0 | 0 | 0 | 0 |
| asheville-nc | real/1 | credit+insured | 0 | 75.2 | 61435 | 2000 | 59435 | 100 | 240 | 180 | 0 | 0 |
| asheville-nc | real/2 | legacy | 0 | 75.2 | 59926 | 0 | 59926 | 0 | 0 | 0 | 0 | 0 |
| asheville-nc | real/2 | finance | 0 | 75.2 | 59826 | 0 | 59826 | 100 | 0 | 0 | 0 | 0 |
| asheville-nc | real/2 | credit+insured | 0 | 75.2 | 61406 | 2000 | 59406 | 100 | 240 | 180 | 0 | 0 |
| asheville-nc | real/3 | legacy | 0 | 75.2 | 59890 | 0 | 59890 | 0 | 0 | 0 | 0 | 0 |
| asheville-nc | real/3 | finance | 0 | 75.2 | 59790 | 0 | 59790 | 100 | 0 | 0 | 0 | 0 |
| asheville-nc | real/3 | credit+insured | 0 | 75.2 | 61370 | 2000 | 59370 | 100 | 240 | 180 | 0 | 0 |

## Controlled equipment failure

Front Range, one prebuilt Bell Tent at almost zero condition, wear enabled, $10,000 starting cash before purchase, one day. All variants have finance enabled. One subsequent day checks that an existing failure cannot pay twice.

| Policy | Premium | Claim | Debt | Tax due | Cash | Next-day claim |
|---|---:|---:|---:|---:|---:|---:|
| uninsured | 0.00 | 0.00 | 0.00 | 0.00 | 9999.73 | 0.00 |
| insured | 0.49 | 440.00 | 0.00 | 0.00 | 10439.23 | 0.00 |
| insured, no cash | 0.00 | 0.00 | 0.00 | 0.27 | 0.00 | 0.00 |
