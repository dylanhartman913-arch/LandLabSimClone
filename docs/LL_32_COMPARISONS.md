# LL-32 controlled shelter occupancy comparison

Reproduce with `node --import tsx packages/cli/bots/occupancy.ts`. Two adults, greenfield remote-job tutorial policy, 365 days. All variants purchase the same prebuilt spare Bell Tent on day 120. Occupancy keeps the household in its initial home; the closed variant additionally mothballs the spare. Settings otherwise match the current game defaults. Standard seed 1 and Real seeds 1–3 at each site; ordinary supplies, no validation supply. Quest progress can change later action dates. Experimental occupancy remains off by default.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Heat requested (million BTU) | Upkeep requested (h) | Cold days meeting warmth |
|---|---|---|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | legacy | 3 | 75.2 | 58150 | 39.998 | 2455.29 | 209 |
| front-range | standard/1 | occupancy | 1 | 74.4 | 57823 | 8.410 | 2455.00 | 211 |
| front-range | standard/1 | closed | 1 | 74.4 | 57863 | 8.410 | 2447.13 | 211 |
| front-range | real/1 | legacy | 3 | 75.2 | 57819 | 39.132 | 2455.00 | 209 |
| front-range | real/1 | occupancy | 1 | 74.4 | 57418 | 8.192 | 2455.00 | 211 |
| front-range | real/1 | closed | 1 | 74.4 | 57461 | 8.192 | 2447.13 | 211 |
| front-range | real/2 | legacy | 3 | 75.2 | 57777 | 41.205 | 2455.93 | 209 |
| front-range | real/2 | occupancy | 1 | 74.4 | 57351 | 8.694 | 2455.93 | 211 |
| front-range | real/2 | closed | 1 | 74.4 | 57400 | 8.694 | 2448.05 | 211 |
| front-range | real/3 | legacy | 3 | 75.2 | 57188 | 39.845 | 2455.00 | 209 |
| front-range | real/3 | occupancy | 1 | 74.4 | 56726 | 8.396 | 2455.00 | 211 |
| front-range | real/3 | closed | 1 | 74.4 | 56775 | 8.396 | 2447.13 | 211 |
| laramie-wy | standard/1 | legacy | 29 | 0.0 | 31176 | 62.028 | 2454.71 | 28 |
| laramie-wy | standard/1 | occupancy | 1 | 74.4 | 57129 | 12.811 | 2454.71 | 272 |
| laramie-wy | standard/1 | closed | 1 | 74.4 | 57136 | 12.811 | 2446.84 | 272 |
| laramie-wy | real/1 | legacy | 29 | 0.0 | 30936 | 60.840 | 2454.71 | 28 |
| laramie-wy | real/1 | occupancy | 1 | 74.4 | 56894 | 12.517 | 2454.64 | 272 |
| laramie-wy | real/1 | closed | 1 | 74.4 | 56900 | 12.517 | 2446.77 | 272 |
| laramie-wy | real/2 | legacy | 29 | 0.0 | 31261 | 63.764 | 2456.00 | 28 |
| laramie-wy | real/2 | occupancy | 1 | 74.4 | 57000 | 13.211 | 2455.93 | 272 |
| laramie-wy | real/2 | closed | 1 | 74.4 | 57006 | 13.211 | 2448.05 | 272 |
| laramie-wy | real/3 | legacy | 29 | 0.0 | 29966 | 61.708 | 2454.43 | 28 |
| laramie-wy | real/3 | occupancy | 1 | 74.4 | 56006 | 12.770 | 2454.21 | 272 |
| laramie-wy | real/3 | closed | 1 | 74.4 | 56013 | 12.770 | 2446.34 | 272 |
| asheville-nc | standard/1 | legacy | 1 | 75.2 | 59881 | 24.814 | 2457.11 | 150 |
| asheville-nc | standard/1 | occupancy | 1 | 74.3 | 59922 | 5.270 | 2456.57 | 150 |
| asheville-nc | standard/1 | closed | 1 | 74.3 | 59922 | 5.270 | 2448.70 | 150 |
| asheville-nc | real/1 | legacy | 1 | 75.2 | 59956 | 24.271 | 2457.11 | 150 |
| asheville-nc | real/1 | occupancy | 1 | 74.3 | 59926 | 5.131 | 2457.11 | 150 |
| asheville-nc | real/1 | closed | 1 | 74.3 | 59926 | 5.131 | 2449.23 | 150 |
| asheville-nc | real/2 | legacy | 1 | 75.2 | 59926 | 25.567 | 2456.71 | 150 |
| asheville-nc | real/2 | occupancy | 1 | 74.3 | 59897 | 5.451 | 2456.71 | 150 |
| asheville-nc | real/2 | closed | 1 | 74.3 | 59897 | 5.451 | 2448.84 | 150 |
| asheville-nc | real/3 | legacy | 1 | 75.2 | 59890 | 24.721 | 2456.36 | 150 |
| asheville-nc | real/3 | occupancy | 1 | 74.3 | 59856 | 5.263 | 2456.36 | 150 |
| asheville-nc | real/3 | closed | 1 | 74.3 | 59856 | 5.263 | 2448.48 | 150 |
