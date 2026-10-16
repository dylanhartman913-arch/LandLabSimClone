import { expect, it } from 'vitest';
import { fmtNum } from './format.ts';

it('hides floating-point residue without hiding meaningful small quantities', () => {
  expect(fmtNum(2.3e-16)).toBe('0');
  expect(fmtNum(-4.2e-17)).toBe('0');
  expect(fmtNum(0.001)).toBe('1.0e-3');
  expect(fmtNum(-0.001)).toBe('-1.0e-3');
});
