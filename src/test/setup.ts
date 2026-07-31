import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/**
 * jsdom implements neither of these, and both are used by the diagram: ResizeObserver drives
 * the tooltip anchor, and getBoundingClientRect returns zeros so overlays have no size to
 * position against. Stubbed rather than mocked away, so component tests exercise the real
 * render path.
 */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * A working localStorage.
 *
 * Under Node 25 the runtime's experimental localStorage shadows jsdom's, and what lands on
 * `window` is a bare object with no methods. The app survives that (every access is guarded,
 * and it falls back to defaults), which is why nothing appeared broken — but it also meant
 * persistence could never be exercised. A real browser has a real Storage, so the test
 * environment should too.
 */
if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}
