import type { System } from '@homestead/catalog';
import { categoryColor, cssColor, glyphFor, type GlyphKind } from '../sprites/palette.ts';

/** SVG paths on a 24-unit box, mirroring the map's placeholder glyphs. */
const PATHS: Record<GlyphKind, string> = {
  house: 'M5 12 L12 5 L19 12 V19 H5 Z',
  tent: 'M3 19 L12 4 L21 19 Z',
  sun: 'M12 7 a5 5 0 1 0 0.01 0 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2',
  bolt: 'M13 2 L5 13 H11 L10 22 L19 10 H13 Z',
  drop: 'M12 3 C16 9 18 12 18 15 A6 6 0 0 1 6 15 C6 12 8 9 12 3 Z',
  filter: 'M3 4 H21 L14 12 V19 L10 21 V12 Z',
  leaf: 'M5 19 C5 8 12 5 19 5 C19 12 16 19 5 19 Z',
  tree: 'M12 3 a6 6 0 1 0 0.01 0 M11 15 h2 v6 h-2 z',
  sprout: 'M12 21 V11 M12 12 C8 12 6 10 6 8 C9 8 12 9 12 12 M12 10 C12 7 15 5 18 5 C18 8 15 10 12 10',
  egg: 'M12 3 C16 3 18 10 18 14 A6 6 0 0 1 6 14 C6 10 8 3 12 3 Z',
  hoof: 'M4 10 h12 a3 3 0 0 1 0 6 H4 Z M5 16v4 M8 16v4 M12 16v4 M15 16v4 M17 8 a2 2 0 1 0 0.01 0',
  bee: 'M12 7 a4 6 0 1 0 0.01 0 M8 11 h8 M8 14 h8 M7 6 a3 2 0 1 0 0.01 0 M17 6 a3 2 0 1 0 0.01 0',
  wheel: 'M12 4 a8 8 0 1 0 0.01 0 M12 4v16 M4 12h16 M6 6l12 12 M18 6L6 18',
  flame: 'M12 2 C18 9 17 13 16 16 C15 20 9 21 8 16 C7 13 8 9 12 2 Z',
  snow: 'M12 2v20 M3 7l18 10 M3 17L21 7',
  pot: 'M4 10 H20 V16 A4 4 0 0 1 16 20 H8 A4 4 0 0 1 4 16 Z M2 9 H22',
  box: 'M4 6 H20 V20 H4 Z M4 10 H20',
  swirl: 'M12 12 m0 0 a1 1 0 0 1 2 0 a3 3 0 0 1 -5 1 a5 5 0 0 1 8 -4 a7 7 0 0 1 -10 9',
  wrench: 'M4 20 L13 11 M14 4 a5 5 0 1 0 6 6 L17 9 L15 7 Z',
  flower:
    'M12 5 a3 3 0 1 0 0.01 0 M6 10 a3 3 0 1 0 0.01 0 M18 10 a3 3 0 1 0 0.01 0 M8 17 a3 3 0 1 0 0.01 0 M16 17 a3 3 0 1 0 0.01 0',
  coin: 'M12 3 a9 9 0 1 0 0.01 0 M12 7v10',
  field: 'M3 6h18 M3 10h18 M3 14h18 M3 18h18',
  person: 'M12 3 a3 3 0 1 0 0.01 0 M7 21 V13 a5 5 0 0 1 10 0 V21 Z',
};

const FILLED: Partial<Record<GlyphKind, boolean>> = {
  house: true,
  tent: true,
  bolt: true,
  drop: true,
  filter: true,
  leaf: true,
  egg: true,
  flame: true,
  pot: true,
  box: true,
  person: true,
};

export function SystemIcon({ system, size = 40 }: { system: System; size?: number }) {
  const glyph = glyphFor(system.categories);
  const color = cssColor(categoryColor(system.categories[0]));
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="sys-icon">
      <rect x="1" y="2" width="30" height="29" rx="7" fill="rgba(0,0,0,0.25)" />
      <rect x="1" y="1" width="30" height="29" rx="7" fill={color} stroke="rgba(0,0,0,0.3)" />
      <g transform="translate(4 3.5)">
        <path
          d={PATHS[glyph]}
          fill={FILLED[glyph] ? '#fbf5e6' : 'none'}
          stroke="#fbf5e6"
          strokeWidth={FILLED[glyph] ? 0 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
