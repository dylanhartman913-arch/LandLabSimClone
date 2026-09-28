/** Time-mode constants. Every value is documented in docs/ENGINE.md (Constants). */
export const BUY_SETUP_FRACTION = 0.25;
export const DIY_SETUP_FRACTION = 1;
export const DEFAULT_CONSTRUCTION_SHARE = 0.6;
export const REFUND_BUILT = 0.25;
export const REFUND_BUILDING = 1;

export const HEALTH_WEIGHTS = { food: 0.35, drinkingWater: 0.45, heat: 0.25, shelter: 0.2 } as const;
export type PersonNeed = keyof typeof HEALTH_WEIGHTS;
export const PERSON_NEEDS: PersonNeed[] = ['food', 'drinkingWater', 'heat', 'shelter'];
export const HEALTH_FLOOR = 0.3;
export const HARDSHIP_THRESHOLD = 0.8;
export const HARDSHIP_DAYS = 3;
export const HARDSHIP_REPEAT_DAYS = 7;
export const ROLLING_DAYS = 7;

export const COLD_STORAGE_SPOIL_CUT = 0.8;
export const LEDGER_DAYS_KEPT = 730;
export const EPS = 1e-9;

export const DEFAULT_STARTING_CASH = 100_000;
export const DEFAULT_ARRIVAL_SUPPLIES: Record<string, number> = {
  Food: 28_000,
  'Drinking water': 20,
  Water: 100,
};
export const DEFAULT_PARCEL_ACRES = 1;
export const SQFT_PER_ACRE = 43_560;
