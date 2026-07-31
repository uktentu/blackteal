/**
 * Application state. One simulation tick produces exactly ONE store update.
 *
 * The store owns four things the pure simulator deliberately does not: which asset is
 * selected, operator actions on alarms (ack/shelve), feed liveness as observed by the UI, and
 * the alarm event log.
 */

import { create } from 'zustand';
import { INITIAL_SNAPSHOT } from '../domain/snapshot';
import type { Alarm, Severity, SiteState } from '../domain/types';
import { simulateFrame, siteSummary, TICK_MS } from '../sim/simulate';
import { initialControl, type SimControl, type TriggerKind } from '../sim/scenarios';
import { groupAlarms, type AlarmGroup } from '../sim/alarmFeed';
import { appendEvents, diffAlarms, type AlarmEvent } from '../sim/alarmHistory';

/** Ring buffer length for detail-panel sparklines (Stage 3). */
const HISTORY = 60;

/**
 * How long a shelve lasts before it expires by itself.
 *
 * Real alarm shelving is always time-boxed (ISA-18.2). An indefinite shelve is how an alarm
 * gets permanently lost — someone silences it during maintenance, forgets, and nobody sees it
 * again. Short here so the behaviour is demonstrable in a review rather than theoretical.
 */
export const SHELVE_DURATION_MS = 60_000;

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
  /** Wall-clock ms, updated each tick — the header clock reads this, not Date.now() at render. */
  now: number;
  /** True when the feed has stopped or the simulator flagged a dropout. */
  stale: boolean;
  running: boolean;

  selectedId: string | null;
  filters: AlarmFilters;

  /** key = `${assetId}:${code}` */
  acknowledged: Set<string>;
  /** key -> wall-clock ms at which the shelve expires. */
  shelvedUntil: Map<string, number>;

  /** Per-asset metric history for sparklines. */
  history: Record<string, number[]>;
  /** Alarm event log — raised/cleared/acked/shelved, bounded ring buffer. */
  events: AlarmEvent[];

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
let seq = 0;

/** Key metric per asset type, sampled each tick for the sparkline. */
function sampleMetric(site: SiteState, id: string): number | null {
  const a = site.assets[id];
  if ('pcs' in a) return a.pcs?.power_kW == null ? null : a.pcs.power_kW / 1000;
  if ('metrics' in a) return a.metrics.power_MW ?? null;
  return null;
}

function logEvent(
  events: AlarmEvent[],
  at: number,
  kind: AlarmEvent['kind'],
  assetId: string,
  alarm: Alarm,
): AlarmEvent[] {
  return appendEvents(events, [
    { seq: seq++, at, kind, assetId, code: alarm.code, severity: alarm.severity, message: alarm.message },
  ]);
}

export const useSiteStore = create<SiteStore>((set, get) => ({
  site: INITIAL_SNAPSHOT,
  tick: 0,
  lastFrameAt: Date.now(),
  now: Date.now(),
  stale: false,
  running: false,

  selectedId: null,
  filters: { assetId: null, severity: null, showShelved: true },

  acknowledged: new Set(),
  shelvedUntil: new Map(),
  history: {},
  events: [],

  tickOnce: () => {
    const prev = get();
    control.t += TICK_MS / 1000;
    seed = (seed * 1664525 + 1013904223) >>> 0;

    const site = simulateFrame(prev.site, control, seed);
    const at = Date.now();

    // Sample history in the same pass, so one tick is still one update.
    const history = { ...prev.history };
    for (const id of Object.keys(site.assets)) {
      const v = sampleMetric(site, id);
      if (v === null) continue;
      const series = history[id] ?? [];
      history[id] = series.length >= HISTORY ? [...series.slice(1), v] : [...series, v];
    }

    // Raised/cleared transitions — the trace a self-clearing alarm would otherwise not leave.
    const diffs = diffAlarms(prev.site, site, at, seq);
    seq += diffs.length;
    const events = appendEvents(prev.events, diffs);

    /**
     * Acknowledgements are cleared when the underlying alarm clears, so the same condition
     * recurring re-demands attention. Shelves expire on their own timer.
     */
    const live = new Set(
      Object.entries(site.assets).flatMap(([id, a]) => a.alarms.map((x) => alarmKey(id, x.code))),
    );
    const acknowledged = new Set([...prev.acknowledged].filter((k) => live.has(k)));

    let shelvedUntil = prev.shelvedUntil;
    const expired = [...prev.shelvedUntil].filter(([, until]) => until <= at);
    if (expired.length > 0) {
      shelvedUntil = new Map(prev.shelvedUntil);
      for (const [k] of expired) shelvedUntil.delete(k);
    }

    set({
      site,
      history,
      events,
      acknowledged,
      shelvedUntil,
      tick: prev.tick + 1,
      now: at,
      /**
       * Frozen while the feed is down, so "last frame Ns ago" actually ages. Refreshing it
       * every tick would report a disconnected feed as 0s old — the precise flavour of
       * presenting stale data as live that the brief warns against.
       */
      lastFrameAt: site.stale ? prev.lastFrameAt : at,
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
    set((s) => ({
      acknowledged: new Set(s.acknowledged).add(alarmKey(assetId, alarm.code)),
      events: logEvent(s.events, Date.now(), 'acknowledged', assetId, alarm),
    })),

  shelve: (assetId, alarm) =>
    set((s) => {
      const next = new Map(s.shelvedUntil);
      next.set(alarmKey(assetId, alarm.code), Date.now() + SHELVE_DURATION_MS);
      return { shelvedUntil: next, events: logEvent(s.events, Date.now(), 'shelved', assetId, alarm) };
    }),

  unshelve: (assetId, alarm) =>
    set((s) => {
      const next = new Map(s.shelvedUntil);
      next.delete(alarmKey(assetId, alarm.code));
      return { shelvedUntil: next, events: logEvent(s.events, Date.now(), 'unshelved', assetId, alarm) };
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
 * (`site`, `filters`, `acknowledged`, `shelvedUntil`) and memoize these against them instead.
 */
export const buildSummary = siteSummary;

export function buildAlarmGroups(
  site: SiteState,
  acknowledged: Set<string>,
  shelvedUntil: Map<string, number>,
  filters: AlarmFilters,
): AlarmGroup[] {
  return groupAlarms(site, { acknowledged, shelvedUntil, filters });
}
