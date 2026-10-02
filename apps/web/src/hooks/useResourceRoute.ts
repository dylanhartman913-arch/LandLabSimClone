import { useEffect } from 'react';
import { useGame } from '../store/game.ts';

const PREFIX = '#/resource/';

/** `#/resource/<name>` opens that resource's page; the page keeps the address in step (G13). */
export function useResourceRoute() {
  useEffect(() => {
    const open = () => {
      const h = window.location.hash;
      if (!h.startsWith(PREFIX)) return;
      const name = decodeURIComponent(h.slice(PREFIX.length));
      if (useGame.getState().resourcePage !== name) useGame.getState().openResource(name, { push: false });
    };
    open();
    window.addEventListener('hashchange', open);
    const unsub = useGame.subscribe((s, prev) => {
      if (s.resourcePage === prev.resourcePage) return;
      const want = s.resourcePage ? `${PREFIX}${encodeURIComponent(s.resourcePage)}` : '';
      if (window.location.hash !== want) {
        const url = `${window.location.pathname}${window.location.search}${want}`;
        window.history.replaceState(null, '', url);
      }
    });
    return () => {
      window.removeEventListener('hashchange', open);
      unsub();
    };
  }, []);
}
