/**
 * Persistence tests.
 *
 * The point of these is that a bad stored value can NEVER produce a broken dashboard.
 * localStorage is user-writable and outlives deploys, so every field is validated on read.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  loadLayout,
  saveLayout,
  clampConsoleHeight,
  consoleMax,
  DEFAULT_LAYOUT,
  CONSOLE_MIN,
} from './persist';

const KEY = 'blackteal.layout.v1';

// These tests replace the global `window`; restore it so the stub cannot leak into any
// component test that shares this worker.
afterEach(() => vi.unstubAllGlobals());

function stubStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('window', {
    innerHeight: 900,
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  });
  return map;
}

describe('layout persistence', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = stubStorage();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it('round-trips a saved layout', () => {
    const layout = {
      ...DEFAULT_LAYOUT,
      consoleHeight: 320,
      consoleCollapsed: true,
      filterSeverity: 'critical' as const,
    };
    saveLayout(layout);
    expect(loadLayout()).toEqual(layout);
  });

  it('clamps a stored height that would make the app unusable', () => {
    store.set(KEY, JSON.stringify({ ...DEFAULT_LAYOUT, consoleHeight: 99999 }));
    expect(loadLayout().consoleHeight).toBeLessThanOrEqual(consoleMax());

    store.set(KEY, JSON.stringify({ ...DEFAULT_LAYOUT, consoleHeight: -50 }));
    expect(loadLayout().consoleHeight).toBe(CONSOLE_MIN);
  });

  it('rejects wrong types field-by-field instead of failing whole', () => {
    store.set(
      KEY,
      JSON.stringify({ consoleHeight: 'tall', consoleCollapsed: 1, filterSeverity: 'urgent' }),
    );
    const got = loadLayout();
    expect(got.consoleHeight).toBe(DEFAULT_LAYOUT.consoleHeight);
    expect(got.consoleCollapsed).toBe(DEFAULT_LAYOUT.consoleCollapsed);
    expect(got.filterSeverity).toBeNull();
  });

  it('survives corrupt JSON', () => {
    store.set(KEY, '{not json');
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it('never throws when storage is unavailable (private browsing, quota)', () => {
    vi.stubGlobal('window', {
      innerHeight: 900,
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('quota');
        },
      },
    });
    expect(() => loadLayout()).not.toThrow();
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout(DEFAULT_LAYOUT)).not.toThrow();
  });

  it('does not persist acknowledgements or shelving', () => {
    // Operational decisions must not silently carry into another shift.
    saveLayout(DEFAULT_LAYOUT);
    const raw = store.get(KEY)!;
    expect(raw).not.toContain('acknowledg');
    expect(raw).not.toContain('shelved');
  });

  it('clamps to a fraction of the viewport, not a fixed pixel value', () => {
    vi.stubGlobal('window', { innerHeight: 400, localStorage: { getItem: () => null, setItem: () => {} } });
    expect(clampConsoleHeight(10_000)).toBeLessThanOrEqual(400);
  });
});
