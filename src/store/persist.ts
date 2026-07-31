/**
 * Operator layout persistence.
 *
 * A control-room screen is arranged once and then lived in for a shift. Resetting the console
 * height, the collapsed state, and the active filters on every reload is a small thing that
 * makes software feel disposable — and on a screen someone watches for eight hours, it isn't
 * small.
 *
 * Deliberately narrow: only *layout and view preferences* persist. Alarm acknowledgements and
 * shelving are NOT stored here. Those are operational decisions with a real-world meaning, and
 * silently restoring a shelve from a previous session could hide a live alarm from whoever
 * comes on shift next. They live in memory and start clean.
 */

const KEY = 'blackteal.layout.v1';

export type SiteView = 'diagram' | 'site';

export interface PersistedLayout {
  /** Which surface the operator last had open. */
  view: SiteView;
  consoleHeight: number;
  consoleCollapsed: boolean;
  filterAssetId: string | null;
  filterSeverity: 'critical' | 'warning' | null;
  showShelved: boolean;
}

export const DEFAULT_LAYOUT: PersistedLayout = {
  // The single-line diagram is the default: it is the denser, faster read for monitoring.
  view: 'diagram',
  consoleHeight: 240,
  consoleCollapsed: false,
  filterAssetId: null,
  filterSeverity: null,
  showShelved: true,
};

/** Bounds for the console, so a stored value can never render the app unusable. */
export const CONSOLE_MIN = 96;
export const CONSOLE_MAX_RATIO = 0.75;

export function consoleMax(): number {
  return Math.max(CONSOLE_MIN, Math.round(window.innerHeight * CONSOLE_MAX_RATIO));
}

export function clampConsoleHeight(h: number): number {
  return Math.min(consoleMax(), Math.max(CONSOLE_MIN, Math.round(h)));
}

/**
 * Read stored layout, falling back field-by-field.
 *
 * Every value is validated rather than trusted: localStorage is user-writable and survives
 * across deploys, so a stale or hand-edited entry must not be able to produce a broken screen.
 */
export function loadLayout(): PersistedLayout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;

  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_LAYOUT;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_LAYOUT;
    const p = parsed as Partial<PersistedLayout>;

    return {
      view: p.view === 'site' ? 'site' : 'diagram',
      consoleHeight:
        typeof p.consoleHeight === 'number' && Number.isFinite(p.consoleHeight)
          ? clampConsoleHeight(p.consoleHeight)
          : DEFAULT_LAYOUT.consoleHeight,
      consoleCollapsed:
        typeof p.consoleCollapsed === 'boolean' ? p.consoleCollapsed : DEFAULT_LAYOUT.consoleCollapsed,
      filterAssetId: typeof p.filterAssetId === 'string' ? p.filterAssetId : null,
      filterSeverity:
        p.filterSeverity === 'critical' || p.filterSeverity === 'warning' ? p.filterSeverity : null,
      showShelved: typeof p.showShelved === 'boolean' ? p.showShelved : DEFAULT_LAYOUT.showShelved,
    };
  } catch {
    // Private browsing, quota, corrupt JSON — never let storage break the dashboard.
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: PersistedLayout): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* Persistence is a convenience; failing to store must never surface to the operator. */
  }
}
