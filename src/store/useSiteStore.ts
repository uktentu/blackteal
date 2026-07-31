/**
 * Application state. One simulation tick produces exactly ONE store update.
 *
 * The store owns three things the pure simulator deliberately does not: which asset is
 * selected, operator actions on alarms (ack/shelve), and feed liveness as observed by the UI.
 */

import { create } from 'zustand';
import { INITIAL_SNAPSHOT } from '../domain/snapshot';
import type { Alarm, Severity, SiteState } from '../domain/types';
import { simulateFrame, siteSummary, TICK_MS } from '../sim/simulate';
import { initialControl, type SimControl, type TriggerKind } from '../sim/scenarios';
import { groupAlarms, type AlarmGroup } from '../sim/alarmFeed';

/** How long without a frame before the UI declares the feed stale. */
export const STALE_AFTER_MS = 3000;

/** Ring buffer length for detail-panel sparklines (Stage 3). */
const HISTORY = 60;

export interface AlarmFilters {
  assetId: string | null;
  severity: Severity | null;
  showShelved: boolean;
}

interface SiteStore {
  site: SiteState;
  /** Monotonic tick count — cheap way for memoized children to know a frame landed. */
  tick: number;
  /** Wall-clock ms of the last accepted frame. Drives the stale indicator. */
  lastFrameAt: number;
  /** True when the feed has stopped or the simulator flagged a dropout. */
  stale: boolean;
  running: boolean;

  selectedId: string | null;
  filters: AlarmFilters;

  /** key = `${assetId}:${code}` */
  acknowledged: Set<string>;
  shelved: Set<string>;

  /** Per-asset metric history for sparklines. */
  history: Record<string, number[]>;

  tickOnce: () => void;
  start: () => void;
  stop: () => void;
  trigger: (kind: TriggerKind) => void;

  select: (id: string | null) => void;
  selectAdjacent: (delta: 1 | -1) => void;

  acknowledge: (assetId: string, alarm: Alarm) => void;
  shelve: (assetId: string, alarm: Alarm) => void;
  unshelve: (assetId: string, alarm: Alarm) => void;
  setFilters: (patch: Partial<AlarmFilters>) => void;
}

export const alarmKey = (assetId: string, code: string) => `${assetId}:${code}`;

/** Control state lives outside the store: it is simulator bookkeeping, not render state. */
const control: SimControl = initialControl();
let timer: ReturnType<typeof setInterval> | null = null;
let seed = 0x9e3779b9;

/** Key metric per asset type, sampled each tick for the sparkline. */
function sampleMetric(site: SiteState, id: string): number | null {
  const a = site.assets[id];
  if ('pcs' in a) return a.pcs?.power_kW == null ? null : a.pcs.power_kW / 1000;
  if ('metrics' in a) return a.metrics.power_MW ?? null;
  return null;
}

export const useSiteStore = create<SiteStore>((set, get) => ({
  site: INITIAL_SNAPSHOT,
  tick: 0,
  lastFrameAt: Date.now(),
  stale: false,
  running: false,

  selectedId: null,
  filters: { assetId: null, severity: null, showShelved: true },

  acknowledged: new Set(),
  shelved: new Set(),
  history: {},

  tickOnce: () => {
    const prev = get();
    control.t += TICK_MS / 1000;
    seed = (seed * 1664525 + 1013904223) >>> 0;

    const site = simulateFrame(prev.site, control, seed);

    // Sample history in the same pass, so one tick is still one update.
    const history = { ...prev.history };
    for (const id of Object.keys(site.assets)) {
      const v = sampleMetric(site, id);
      if (v === null) continue;
      const series = history[id] ?? [];
      history[id] = series.length >= HISTORY ? [...series.slice(1), v] : [...series, v];
    }

    /**
     * Acknowledgements are cleared when the underlying alarm clears, so the same condition
     * recurring re-demands attention. Shelving is an explicit operator decision and survives.
     */
    const live = new Set(
      Object.entries(site.assets).flatMap(([id, a]) => a.alarms.map((x) => alarmKey(id, x.code))),
    );
    const acknowledged = new Set([...prev.acknowledged].filter((k) => live.has(k)));

    set({
      site,
      history,
      acknowledged,
      tick: prev.tick + 1,
      /**
       * Frozen while the feed is down, so "last frame Ns ago" actually ages. Refreshing it
       * every tick would report a disconnected feed as 0s old — the precise flavour of
       * presenting stale data as live that the brief warns against.
       */
      lastFrameAt: site.stale ? prev.lastFrameAt : Date.now(),
      stale: site.stale,
    });
  },

  start: () => {
    if (timer !== null) return;
    timer = setInterval(() => get().tickOnce(), TICK_MS);
    set({ running: true });
  },

  stop: () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    set({ running: false });
  },

  trigger: (kind) => {
    control.queued.push(kind);
  },

  select: (id) => set({ selectedId: id }),

  selectAdjacent: (delta) => {
    const { selectedId, site } = get();
    const ids = Object.keys(site.assets);
    if (selectedId === null) {
      set({ selectedId: ids[0] });
      return;
    }
    const i = ids.indexOf(selectedId);
    set({ selectedId: ids[(i + delta + ids.length) % ids.length] });
  },

  acknowledge: (assetId, alarm) =>
    set((s) => ({ acknowledged: new Set(s.acknowledged).add(alarmKey(assetId, alarm.code)) })),

  shelve: (assetId, alarm) =>
    set((s) => ({ shelved: new Set(s.shelved).add(alarmKey(assetId, alarm.code)) })),

  unshelve: (assetId, alarm) =>
    set((s) => {
      const next = new Set(s.shelved);
      next.delete(alarmKey(assetId, alarm.code));
      return { shelved: next };
    }),

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
}));

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/**
 * These are deliberately NOT zustand selectors.
 *
 * Both build a fresh object graph on every call. Passing them to `useSiteStore(...)` would
 * hand useSyncExternalStore a new snapshot reference each render, which zustand v5 treats as
 * a changed store — an infinite re-render loop. Components subscribe to the stable slices
 * (`site`, `filters`, `acknowledged`, `shelved`) and memoize these against them instead.
 */
export const buildSummary = siteSummary;

export function buildAlarmGroups(
  site: SiteState,
  acknowledged: Set<string>,
  shelved: Set<string>,
  filters: AlarmFilters,
): AlarmGroup[] {
  return groupAlarms(site, { acknowledged, shelved, filters });
}
