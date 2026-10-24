import { expect, it } from 'vitest';
import { fmtNum } from './format.ts';

it('hides floating-point residue without hiding meaningful small quantities', () => {
  expect(fmtNum(2.3e-16)).toBe('0');
  expect(fmtNum(-4.2e-17)).toBe('0');
  // LL-22: small but real quantities stay visible, in plain decimals rather than scientific notation.
  expect(fmtNum(0.001)).toBe('0.001');
  expect(fmtNum(-0.001)).toBe('-0.001');
  expect(fmtNum(0.0019)).toBe('0.002');
  expect(fmtNum(0.0004)).toBe('< 0.001');
  expect(fmtNum(0.0004)).not.toMatch(/e/);
});

it('caps runway displays and avoids false precision', async () => {
  const { fmtDays } = await import('./format.ts');
  expect(fmtDays(21_500)).toBe('over a year');
  expect(fmtDays(43.3)).toBe('43.3 days');
  expect(fmtDays(1)).toBe('1 day');
});
