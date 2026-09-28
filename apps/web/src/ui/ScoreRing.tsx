import type { Explained } from '@homestead/engine';
import { fmtPct } from '../lib/format.ts';

/** A ring showing a 0-1 share. The value and its formula come from the engine. */
export function ScoreRing({ score, size = 44, label }: { score: Explained; size?: number; label: string }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, score.value));
  const tone = share >= 0.75 ? '#7ed957' : share >= 0.4 ? '#f2c641' : '#e0523d';
  return (
    <div
      className="score-ring"
      title={`${label}: ${score.explain.formula}`}
      aria-label={`${label} ${fmtPct(share)}`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="5"
          strokeDasharray={`${c * share} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="score-ring-value" data-testid="score-value">
        {fmtPct(share)}
      </span>
    </div>
  );
}
