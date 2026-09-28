import type { HudMetrics } from '@homestead/engine';

/** Weather glyph from the engine's day: snow, rain, cloud, or sun. Label text accompanies it. */
export function weatherKind(
  w: HudMetrics['weather'],
  season: HudMetrics['season'],
): 'snow' | 'rain' | 'cloud' | 'sun' {
  if (season === 'winter' && w.hdd > 25) return 'snow';
  if (w.precipIn > 0.06) return 'rain';
  if (w.psh < 4) return 'cloud';
  return 'sun';
}

const LABEL = { snow: 'Snowy', rain: 'Rainy', cloud: 'Overcast', sun: 'Sunny' };

export function WeatherIcon({ kind }: { kind: ReturnType<typeof weatherKind> }) {
  return (
    <span className="weather" title={LABEL[kind]} aria-label={LABEL[kind]}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        {kind === 'sun' && (
          <g stroke="#f2c641" strokeWidth="2" strokeLinecap="round" fill="#f2c641">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" fill="none" />
          </g>
        )}
        {kind !== 'sun' && <path d="M6 17a4 4 0 0 1 .5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 8Z" fill="#dfe6ea" />}
        {kind === 'rain' && (
          <path d="M8 19l-1 3M12 19l-1 3M16 19l-1 3" stroke="#7fc4d8" strokeWidth="2" strokeLinecap="round" />
        )}
        {kind === 'snow' && (
          <g fill="#ffffff">
            <circle cx="8" cy="21" r="1.2" />
            <circle cx="12" cy="22" r="1.2" />
            <circle cx="16" cy="21" r="1.2" />
          </g>
        )}
      </svg>
      <span className="sr-only">{LABEL[kind]}</span>
    </span>
  );
}
