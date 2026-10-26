import { describe, expect, it } from 'vitest';
import { getQuestLine } from '@homestead/catalog';
import { advanceTutorial, gameDigest, goalStatus, newTutorial, questStepText, startGame, survivalAlerts, transitionForecast, type GameState } from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const line = getQuestLine('greenfield-instructions');
const quest = (id: string) => line.quests.find((q) => q.id === id)!;
const status = (s: GameState, id: string) => goalStatus(s, catalog, quest(id).goal, s.calendar.absDay);
const withQuest = (s: GameState, id: string) => ({ ...s, tutorial: { ...newTutorial(line.id, s.calendar.absDay), current: line.quests.findIndex((q) => q.id === id) } });

describe('LL-58 visible tutorial requirements', () => {
  it('a raised bed alone, unfinished potatoes or missing compost cannot earn planting assistance', () => {
    const bed = newGame({ 'Raised Beds (24 sq ft)': 1 });
    const both = newGame({ 'Raised Beds (24 sq ft)': 1, 'Potato Patch (400 sq ft)': 1 });
    const supplied = { ...both, stocks: { ...both.stocks, Compost: 250 } };
    for (const s of [bed, { ...both, stocks: { ...both.stocks, Compost: 0 } }, { ...supplied, instances: supplied.instances.map((i) => i.systemId === sysId('Potato Patch (400 sq ft)') ? { ...i, status: 'building' as const } : i) }]) {
      expect(status(s, 'gf-bed').done).toBe(false);
      expect(advanceTutorial(withQuest(s, 'gf-bed'), catalog).completed).toBeNull();
    }
    expect(status(supplied, 'gf-bed').done).toBe(true);
    expect(advanceTutorial(withQuest(supplied, 'gf-bed'), catalog).completed!.id).toBe('gf-bed');
    expect(quest('gf-bed').steps.some((s) => s.do === 'buy' && s.resource === 'Soil')).toBe(false);
    expect(quest('gf-bed').reason).toContain('imported free');
  });

  for (const id of ['gf-compost', 'gf-autowater', 'gf-hens', 'gf-heater']) it(`${id}: omitting any required supply or work setting blocks completion`, () => {
    const q = quest(id);
    expect(q.goal.kind).toBe('all');
    if (q.goal.kind !== 'all') throw new Error('Expected combined goal');
    for (const goal of q.goal.of.filter((g) => g.kind === 'standing' || g.kind === 'workCap')) {
      const s = newGame({});
      expect(goalStatus(s, catalog, goal, 0).done).toBe(false);
      if (goal.kind === 'standing') {
        const order = { resource: goal.resource, keepAbove: goal.keepAbove!, orderUpTo: goal.orderUpTo! };
        const stocked = { ...s, market: { ...s.market!, standing: [order] } };
        expect(goalStatus(stocked, catalog, goal, 0).done).toBe(true);
        expect(goalStatus({ ...stocked, market: { ...stocked.market!, standing: [{ ...order, keepAbove: 1 }] } }, catalog, goal, 0).done).toBe(false);
      } else if (goal.kind === 'workCap') {
        expect(goalStatus({ ...s, settings: { ...s.settings, work: { caps: { 'gather-food': 20 } } } }, catalog, goal, 0).done).toBe(true);
      }
    }
  });

  it('every scripted action has visible, concrete quantities and system names', () => {
    for (const q of line.quests) for (const step of q.steps) {
      const text = questStepText(step, catalog);
      expect(text.length).toBeGreaterThan(15);
      if (step.do === 'place') expect(text).toContain(step.system);
      if (step.do === 'buy') { expect(text).toContain(step.resource); expect(text).toContain(String(step.amount)); }
      if (step.do === 'standing') { expect(text).toContain(step.resource); expect(text.replaceAll(',', '')).toContain(String(step.keepAbove)); expect(text.replaceAll(',', '')).toContain(String(step.orderUpTo)); }
      if (step.do === 'workCap') expect(text).toContain(`${step.hours}.0 h/week`);
    }
  });

  it('saved seasonal games keep their old goals; new games select checked instructions', () => {
    const init = { siteId: 'front-range', seed: 1, start: { id: 'greenfield', difficulty: 'standard' as const, household: 2 }, settings: { tutorialSeasons: true } };
    expect(startGame(catalog, init).tutorial!.line).toBe('greenfield-seasons');
    expect(startGame(catalog, { ...init, settings: { ...init.settings, tutorialInstructions: true } }).tutorial!.line).toBe(line.id);
    expect(getQuestLine('greenfield-seasons').quests.find((q) => q.id === 'gf-bed')!.goal.kind).toBe('have');
  });
});

describe('LL-59 forecast event and deadline agree', () => {
  const state = () => newGame({ 'Human Being': 2 }, { settings: { startingStocks: { Food: 300000, 'Drinking water': 300 } } });
  const fixture = (s: GameState, cashZeroDay: number | null = 65) => ({ asOfDay: s.calendar.absDay, days: 90, firstHarm: { need: 'Food', days: 53 }, departureDay: 77, cashZeroDay });
  it('food at 53 leads departure at 77 and cash at 65, with a matching action', () => {
    const s = state();
    const a = survivalAlerts(s, catalog, fixture(s)).find((a) => a.id === 'forecast')!;
    expect(a).toMatchObject({ title: 'Forecast: Food falls short in about 53 days', days: 53, resource: 'Food' });
    expect(a.detail.indexOf('Food falls short')).toBeLessThan(a.detail.indexOf('cash reaches'));
    expect(a.detail.indexOf('cash reaches')).toBeLessThan(a.detail.indexOf('residents leave'));
    expect(survivalAlerts(s, catalog, fixture(s, 30)).find((a) => a.id === 'forecast')).toMatchObject({ days: 30, resource: null, title: 'Forecast: cash reaches $0 in about 30 days' });
  });
  it('cached countdowns age daily, name their basis and never reannounce a passed event', () => {
    const s = state(), fc = fixture(s);
    for (let age = 0; age < 7; age++) {
      const later = { ...s, calendar: { ...s.calendar, absDay: s.calendar.absDay + age } };
      const a = survivalAlerts(later, catalog, fc).find((a) => a.id === 'forecast')!;
      expect(a.days).toBe(53 - age);
      expect(a.title).toContain(`about ${53 - age} days`);
      expect(a.detail).toContain(`as of day ${fc.asOfDay}`);
      expect(a.detail).toContain(`${age} day${age === 1 ? '' : 's'} old`);
    }
    const later = { ...s, calendar: { ...s.calendar, absDay: s.calendar.absDay + 54 } };
    expect(survivalAlerts(later, catalog, fc).find((a) => a.id === 'forecast')).toMatchObject({ days: 11, resource: null });
  });
  it('projection and alert rendering leave live state byte-for-byte unchanged', () => {
    const s = state(), before = JSON.stringify(s), digest = gameDigest(s);
    const fc = transitionForecast(s, catalog);
    expect(fc.asOfDay).toBe(s.calendar.absDay);
    survivalAlerts(s, catalog, fc);
    expect(JSON.stringify(s)).toBe(before);
    expect(gameDigest(s)).toBe(digest);
  });
});
