import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const probePath = `${root}packages/engine/src/__purity_probe.ts`;

async function lintEngineSnippet(code: string) {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath: probePath });
  return (result?.messages ?? []).map((m) => m.ruleId);
}

describe('the engine stays pure', () => {
  it('cannot import React', async () => {
    const rules = await lintEngineSnippet("import { useState } from 'react';\nexport const x = useState;\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('cannot import PixiJS', async () => {
    const rules = await lintEngineSnippet(
      "import { Application } from 'pixi.js';\nexport const x = Application;\n",
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('cannot call Math.random or Date.now', async () => {
    const rules = await lintEngineSnippet('export const a = Math.random();\nexport const b = Date.now();\n');
    expect(rules.filter((r) => r === 'no-restricted-properties')).toHaveLength(2);
  });

  it('allows plain TypeScript', async () => {
    const rules = await lintEngineSnippet('export const add = (a: number, b: number): number => a + b;\n');
    expect(rules).toEqual([]);
  });
});
