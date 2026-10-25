# LL-39 transportation-access comparisons

Reproduce with `node --import tsx packages/cli/bots/access.ts`. Experimental game balance, no default changes. Matched first-year (365-day) policies at three sites; Standard seed 1 and Real seeds 1–3. Greenfield remote work, greenfield part-time on-site work, and adapt-upgrader. Settings otherwise match current defaults: risk, Finance, wear and livestock experiments remain off on both sides. Only `transportAccess` differs; the existing bots keep their decisions. Coverage omits access trips only in the enabled variant, so score changes must not be read as new physical supplies.

| Route | Site | Weather/seed | Access gate | Survival-short days | Min wellbeing | End cash | Completed trips | Blocked trips | Own miles used | Paid fares (year) | Fares payable |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| remote | front-range | standard/1 | off | 0 | 75.2 | 58050 | 0 | 0 | 0.0 | 0 | 0 |
| remote | front-range | standard/1 | on | 0 | 75.4 | 59433 | 63 | 0 | 0.0 | 1575 | 0 |
| remote | front-range | real/1 | off | 0 | 75.2 | 57700 | 0 | 0 | 0.0 | 0 | 0 |
| remote | front-range | real/1 | on | 0 | 75.4 | 59348 | 62 | 0 | 0.0 | 1550 | 0 |
| remote | front-range | real/2 | off | 0 | 75.2 | 57614 | 0 | 0 | 0.0 | 0 | 0 |
| remote | front-range | real/2 | on | 0 | 75.4 | 59160 | 62 | 0 | 0.0 | 1550 | 0 |
| remote | front-range | real/3 | off | 0 | 75.2 | 57027 | 0 | 0 | 0.0 | 0 | 0 |
| remote | front-range | real/3 | on | 0 | 75.4 | 58947 | 60 | 0 | 0.0 | 1500 | 0 |
| remote | laramie-wy | standard/1 | off | 0 | 75.2 | 57249 | 0 | 0 | 0.0 | 0 | 0 |
| remote | laramie-wy | standard/1 | on | 0 | 75.4 | 58040 | 65 | 0 | 0.0 | 1625 | 0 |
| remote | laramie-wy | real/1 | off | 0 | 75.2 | 57014 | 0 | 0 | 0.0 | 0 | 0 |
| remote | laramie-wy | real/1 | on | 0 | 75.4 | 57741 | 69 | 0 | 0.0 | 1725 | 0 |
| remote | laramie-wy | real/2 | off | 0 | 75.2 | 57081 | 0 | 0 | 0.0 | 0 | 0 |
| remote | laramie-wy | real/2 | on | 0 | 75.4 | 57380 | 72 | 0 | 0.0 | 1800 | 0 |
| remote | laramie-wy | real/3 | off | 0 | 75.2 | 56114 | 0 | 0 | 0.0 | 0 | 0 |
| remote | laramie-wy | real/3 | on | 0 | 75.4 | 56995 | 65 | 0 | 0.0 | 1625 | 0 |
| remote | asheville-nc | standard/1 | off | 0 | 75.2 | 59881 | 0 | 0 | 0.0 | 0 | 0 |
| remote | asheville-nc | standard/1 | on | 0 | 75.4 | 59995 | 61 | 0 | 0.0 | 1525 | 0 |
| remote | asheville-nc | real/1 | off | 0 | 75.2 | 59955 | 0 | 0 | 0.0 | 0 | 0 |
| remote | asheville-nc | real/1 | on | 0 | 75.4 | 60066 | 59 | 0 | 0.0 | 1475 | 0 |
| remote | asheville-nc | real/2 | off | 0 | 75.2 | 59926 | 0 | 0 | 0.0 | 0 | 0 |
| remote | asheville-nc | real/2 | on | 0 | 75.4 | 60052 | 58 | 0 | 0.0 | 1450 | 0 |
| remote | asheville-nc | real/3 | off | 0 | 75.2 | 59890 | 0 | 0 | 0.0 | 0 | 0 |
| remote | asheville-nc | real/3 | on | 0 | 75.4 | 60014 | 59 | 0 | 0.0 | 1475 | 0 |
| part | front-range | standard/1 | off | 0 | 75.2 | 8980 | 0 | 0 | 0.0 | 0 | 0 |
| part | front-range | standard/1 | on | 0 | 75.4 | 36573 | 424 | 0 | 0.0 | 3422 | 0 |
| part | front-range | real/1 | off | 0 | 75.2 | 9014 | 0 | 0 | 0.0 | 0 | 0 |
| part | front-range | real/1 | on | 0 | 75.4 | 36546 | 424 | 0 | 0.0 | 3421 | 0 |
| part | front-range | real/2 | off | 0 | 75.2 | 8923 | 0 | 0 | 0.0 | 0 | 0 |
| part | front-range | real/2 | on | 0 | 75.4 | 36479 | 426 | 0 | 0.0 | 3471 | 0 |
| part | front-range | real/3 | off | 0 | 75.2 | 8957 | 0 | 0 | 0.0 | 0 | 0 |
| part | front-range | real/3 | on | 0 | 75.4 | 36558 | 424 | 0 | 0.0 | 3421 | 0 |
| part | laramie-wy | standard/1 | off | 0 | 75.2 | 8306 | 0 | 0 | 0.0 | 0 | 0 |
| part | laramie-wy | standard/1 | on | 0 | 75.4 | 35858 | 434 | 0 | 0.0 | 3673 | 0 |
| part | laramie-wy | real/1 | off | 0 | 75.2 | 8426 | 0 | 0 | 0.0 | 0 | 0 |
| part | laramie-wy | real/1 | on | 0 | 75.4 | 35891 | 432 | 0 | 0.0 | 3622 | 0 |
| part | laramie-wy | real/2 | off | 0 | 75.2 | 8155 | 0 | 0 | 0.0 | 0 | 0 |
| part | laramie-wy | real/2 | on | 0 | 75.4 | 35687 | 431 | 0 | 0.0 | 3597 | 0 |
| part | laramie-wy | real/3 | off | 0 | 75.2 | 8330 | 0 | 0 | 0.0 | 0 | 0 |
| part | laramie-wy | real/3 | on | 0 | 75.4 | 35837 | 434 | 0 | 0.0 | 3671 | 0 |
| part | asheville-nc | standard/1 | off | 0 | 75.2 | 9172 | 0 | 0 | 0.0 | 0 | 0 |
| part | asheville-nc | standard/1 | on | 0 | 75.4 | 36827 | 423 | 0 | 0.0 | 3405 | 0 |
| part | asheville-nc | real/1 | off | 0 | 75.2 | 9187 | 0 | 0 | 0.0 | 0 | 0 |
| part | asheville-nc | real/1 | on | 0 | 75.4 | 36796 | 424 | 0 | 0.0 | 3430 | 0 |
| part | asheville-nc | real/2 | off | 0 | 75.2 | 9127 | 0 | 0 | 0.0 | 0 | 0 |
| part | asheville-nc | real/2 | on | 0 | 75.4 | 36739 | 426 | 0 | 0.0 | 3478 | 0 |
| part | asheville-nc | real/3 | off | 0 | 75.2 | 9198 | 0 | 0 | 0.0 | 0 | 0 |
| part | asheville-nc | real/3 | on | 0 | 75.4 | 36809 | 423 | 0 | 0.0 | 3403 | 0 |
| adapt | front-range | standard/1 | off | 0 | 75.8 | 18020 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | front-range | standard/1 | on | 0 | 75.8 | 22637 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | front-range | real/1 | off | 0 | 75.8 | 18051 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | front-range | real/1 | on | 0 | 75.8 | 22669 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | front-range | real/2 | off | 0 | 75.8 | 17980 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | front-range | real/2 | on | 0 | 75.8 | 22598 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | front-range | real/3 | off | 0 | 75.8 | 18018 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | front-range | real/3 | on | 0 | 75.8 | 22636 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | laramie-wy | standard/1 | off | 0 | 75.8 | 17373 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | laramie-wy | standard/1 | on | 0 | 75.8 | 21990 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | laramie-wy | real/1 | off | 0 | 75.8 | 17424 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | laramie-wy | real/1 | on | 0 | 75.8 | 22042 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | laramie-wy | real/2 | off | 0 | 75.8 | 17307 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | laramie-wy | real/2 | on | 0 | 75.8 | 21925 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | laramie-wy | real/3 | off | 0 | 75.8 | 17371 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | laramie-wy | real/3 | on | 0 | 75.8 | 21989 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | asheville-nc | standard/1 | off | 0 | 75.8 | 18502 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | asheville-nc | standard/1 | on | 0 | 75.8 | 23120 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | asheville-nc | real/1 | off | 0 | 75.8 | 18519 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | asheville-nc | real/1 | on | 0 | 75.8 | 23137 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | asheville-nc | real/2 | off | 0 | 75.8 | 18480 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | asheville-nc | real/2 | on | 0 | 75.8 | 23098 | 729 | 0 | 9797.5 | 0 | 0 |
| adapt | asheville-nc | real/3 | off | 0 | 75.8 | 18499 | 0 | 0 | 0.0 | 0 | 0 |
| adapt | asheville-nc | real/3 | on | 0 | 75.8 | 23117 | 729 | 0 | 9797.5 | 0 | 0 |

The enabled trip counts include batched errands, commute equivalents at allocated work hours, and any necessary town journeys. A completed paid ride supplies access without inventing owned Transportation production. The disabled variant retains its legacy transport requirements and fees; zero recorded access trips there means the new trip ledger was disabled, not that old market deliveries were free.
