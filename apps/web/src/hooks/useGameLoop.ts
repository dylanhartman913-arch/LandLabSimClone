import { useEffect } from 'react';
import { useGame } from '../store/game.ts';

/** Advance the engine at the chosen speed: 1× = one day per second. */
export function useGameLoop() {
  const speed = useGame((s) => s.speed);
  useEffect(() => {
    if (speed === 0) return;
    const id = window.setInterval(() => useGame.getState().tick(1), 1000 / speed);
    return () => window.clearInterval(id);
  }, [speed]);
}
