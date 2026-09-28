import { ENGINE_VERSION } from '@homestead/engine';

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>TERRA Homestead Plugin</h1>
      <p data-testid="engine-version">Engine {ENGINE_VERSION}</p>
    </main>
  );
}
