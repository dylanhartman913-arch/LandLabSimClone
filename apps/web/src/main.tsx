import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import { Multiplayer } from './ui/Multiplayer.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(location.search).has('room') ||
    new URLSearchParams(location.search).has('multiplayer') ? (
      <Multiplayer />
    ) : (
      <>
        <App />
        <a className="multiplayer-entry" href="?multiplayer">
          Multiplayer preview
        </a>
      </>
    )}
  </StrictMode>,
);
