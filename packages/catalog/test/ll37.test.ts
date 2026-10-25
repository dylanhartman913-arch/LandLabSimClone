import { expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { FinanceRuleSchema } from '../src/schema.ts';

it('LL-37 rejects invalid credit, rates and insurance quantities', () => {
  expect(FinanceRuleSchema.safeParse(catalog.finance).success).toBe(true);
  for (const bad of [
    { creditLimit: 0 },
    { annualInterest: -1 },
    { propertyTaxRate: 2 },
    { deductible: -1 },
    { coverage: 0 },
    { insurancePerYear: 0 },
    { emergencyDays: 1.5 },
  ]) {
    expect(FinanceRuleSchema.safeParse({ ...catalog.finance, ...bad }).success).toBe(false);
  }
});
