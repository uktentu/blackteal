/**
 * Scripted scenarios — the state transitions the brief asks to see, plus on-demand triggers.
 *
 * Rule that governs every scenario here: MOVE TELEMETRY, NEVER INJECT ALARMS. Alarms are
 * derived by the rule engine from the metrics. A hand-injected alarm has no telemetry backing
 * it, so the detail panel would show an alarm whose metric looks fine — visibly incoherent,
 * and it silently disables the Stage 4 explanation for that asset.
 *
 * Pure. Scenarios take a frame and return a new one.
 */

import { NAMEPLATE } from '../domain/topology';
import type { SkidAsset, SiteState } from '../domain/types';
import { approach, round } from './random';

/** Wall-clock seconds from the start of the session at which scripted events fire. */
export const TIMELINE = {
  /** Skid 2 begins cooling; its warning clears and the envelope un-derates. */
  skid2CoolStart_s: 10,
  /** Alarm burst across the skids, exercising flood grouping. */
  burst_s: 22,
  /** The burst subsides and the affected skids recover. */
  burstClear_s: 34,
  /** Skid 5 reconnects: OFFLINE -> NORMAL. */
  skid5Reconnect_s: 42,
} as const;

export type TriggerKind = 'burst' | 'dropout' | 'reconnect';

/** Mutable-per-tick control state, kept outside SiteState so frames stay serializable data. */
export interface SimControl {
  /** Seconds elapsed since the session started. */
  t: number;
  /** Scenario ids that have already fired, so one-shots don't re-fire every tick. */
  fired: Set<string>;
  /** Manual triggers queued by the UI since the last tick. */
  queued: TriggerKind[];
  /** True while a manual dropout is in effect. */
  dropout: boolean;
  /** True while the burst is active, so it can be held for a few seconds then released. */
  burstUntil_s: number | null;
  /** Set by a manual reconnect trigger, consumed on the next frame. */
  pendingReconnect: boolean;
}

export function initialControl(): SimControl {
  return {
    t: 0,
    fired: new Set(),
    queued: [],
    dropout: false,
    burstUntil_s: null,
    pendingReconnect: false,
  };
}

/**
 * Drain the manual trigger queue.
 *
 * Split out of `applyScenarios` and run BEFORE the frame is computed, because the dropout
 * toggle has to be honoured even on a tick where no frame is produced — otherwise the feed
 * could be stopped but never restarted.
 */
export function drainTriggers(ctl: SimControl): void {
  for (const trigger of ctl.queued) {
    if (trigger === 'burst') ctl.burstUntil_s = ctl.t + 10;
    if (trigger === 'dropout') ctl.dropout = !ctl.dropout;
    if (trigger === 'reconnect') ctl.pendingReconnect = true;
  }
  ctl.queued = [];
}

const skid = (s: SiteState, id: string) => s.assets[id] as SkidAsset;

/** Shallow-clone a skid so scenarios never mutate the previous frame. */
function withSkid(s: SiteState, id: string, mut: (sk: SkidAsset) => SkidAsset): SiteState {
  return { ...s, assets: { ...s.assets, [id]: mut(skid(s, id)) } };
}

// ---------------------------------------------------------------------------
// Scripted: Skid 2 cools and un-derates
// ---------------------------------------------------------------------------

/**
 * Ramps SKID-2's cell temperature and spread back into range over several seconds.
 *
 * The envelope is restored in lockstep with the temperature, because the derate is the
 * physical *consequence* of the heat — they must never disagree on screen.
 */
function coolSkid2(state: SiteState): SiteState {
  return withSkid(state, 'SKID-2', (sk) => {
    const b = sk.battery;
    if (b == null) return sk;

    // Round first, then derive avg and delta FROM the rounded values. Deriving from the
    // unrounded ones leaves delta != max - min on screen, which reads as fabricated data.
    const max = round(approach(b.cell_temp_max_C ?? 41.2, 34.5, 0.06), 1);
    const min = round(approach(b.cell_temp_min_C ?? 33.1, 30.0, 0.06), 1);

    // Envelope tracks the temperature: fully derated at 42 C, full nameplate at 39 C.
    const span = Math.min(1, Math.max(0, (42 - max) / 3));
    const envelope_kW = Math.round(1500 + span * (NAMEPLATE.pcs_kW - 1500));

    return {
      ...sk,
      battery: {
        ...b,
        cell_temp_max_C: max,
        cell_temp_min_C: min,
        cell_temp_avg_C: round((max + min) / 2, 1),
        cell_temp_delta_C: round(max - min, 1),
        envelope: { ...b.envelope, max_discharge_kW: envelope_kW },
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Scripted: Skid 5 reconnects
// ---------------------------------------------------------------------------

/**
 * Brings SKID-5 back from OFFLINE with a plausible full telemetry set.
 *
 * It returns at a lower SoC than its peers — a skid that has been out of contact has not been
 * discharging with the fleet, and identical numbers across all six would look fabricated.
 */
function reconnectSkid5(state: SiteState): SiteState {
  return withSkid(state, 'SKID-5', (sk) => {
    if (sk.pcs != null) return sk;

    return {
      ...sk,
      state: 'NORMAL',
      pcs: {
        state: 'NORMAL',
        power_kW: -1870,
        mode: 'DISCHARGE',
        ac_voltage_V: 691,
        ac_current_A: 1566,
        dc_voltage_V: 1327,
        efficiency_pct: 97.9,
        igbt_temp_C: 44,
      },
      battery: {
        state: 'NORMAL',
        soc_pct: 54.2,
        soh_pct: 96.8,
        dc_bus_V: 1327,
        current_A: 1436,
        power_kW: -1906,
        c_rate: 0.19,
        cell_v_min: 3.169,
        cell_v_avg: 3.188,
        cell_v_max: 3.216,
        cell_temp_min_C: 27.2,
        cell_temp_avg_C: 29.4,
        cell_temp_max_C: 31.6,
        cell_temp_delta_C: 4.4,
        insulation_MOhm: 3.5,
        strings_online: 24,
        hvac_ok: true,
        envelope: { max_charge_kW: NAMEPLATE.pcs_kW, max_discharge_kW: NAMEPLATE.pcs_kW },
      },
      transformer: { state: 'NORMAL', temp_C: 58, loading_pct: 74 },
      alarms: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Alarm burst
// ---------------------------------------------------------------------------

/**
 * Drives enough telemetry across thresholds to produce 15+ alarms in a few seconds.
 *
 * Spread over four skids and five distinct codes on purpose: a burst of fifteen identical
 * TEMP_HIGH alarms would collapse into a single group and prove nothing. Flood grouping has to
 * be seen *choosing* what to roll up.
 */
function applyBurst(state: SiteState): SiteState {
  let next = state;

  const hot = ['SKID-1', 'SKID-3', 'SKID-4', 'SKID-6'];
  for (const [i, id] of hot.entries()) {
    next = withSkid(next, id, (sk) => {
      const b = sk.battery;
      if (b == null) return sk;

      // Stagger so the codes differ per skid rather than firing one rule six times.
      const max = 41.5 + i * 0.8;
      const min = max - (9.2 + i * 0.4);

      return {
        ...sk,
        battery: {
          ...b,
          cell_temp_max_C: round(max, 1), // TEMP_HIGH
          cell_temp_min_C: round(min, 1),
          cell_temp_avg_C: round((max + min) / 2, 1),
          cell_temp_delta_C: round(max - min, 1), // TEMP_DELTA
          insulation_MOhm: i % 2 === 0 ? 0.82 : 2.9, // INSULATION_LOW on half
          cell_v_max: i === 1 ? 3.58 : b.cell_v_max, // CELL_OV_WARN on one
          hvac_ok: i >= 2 ? false : true, // HVAC_FAULT on two
          envelope: { ...b.envelope, max_discharge_kW: 1400 },
        },
      };
    });
  }

  // One skid goes critical so the console has a real top-of-list entry to sort above the rest.
  // The whole temperature triple moves together — raising max alone would leave delta
  // disagreeing with max - min, which is visibly fabricated data in the detail panel.
  next = withSkid(next, 'SKID-3', (sk) => {
    if (sk.battery == null) return sk;
    const max = 51.4;
    const min = 41.6;
    return {
      ...sk,
      battery: {
        ...sk.battery,
        cell_temp_max_C: max,
        cell_temp_min_C: min,
        cell_temp_avg_C: round((max + min) / 2, 1),
        cell_temp_delta_C: round(max - min, 1),
        insulation_MOhm: 0.42,
      },
    };
  });

  return next;
}

/** Restores the burst-affected skids to healthy telemetry. */
function clearBurst(state: SiteState): SiteState {
  let next = state;

  for (const id of ['SKID-1', 'SKID-3', 'SKID-4', 'SKID-6']) {
    next = withSkid(next, id, (sk) => {
      const b = sk.battery;
      if (b == null) return sk;

      const max = round(approach(b.cell_temp_max_C ?? 34, 33.5, 0.12), 1);
      const min = round(approach(b.cell_temp_min_C ?? 29, 29.2, 0.12), 1);

      return {
        ...sk,
        battery: {
          ...b,
          cell_temp_max_C: max,
          cell_temp_min_C: min,
          cell_temp_avg_C: round((max + min) / 2, 1),
          cell_temp_delta_C: round(max - min, 1),
          insulation_MOhm: round(approach(b.insulation_MOhm ?? 3, 3.2, 0.15), 2),
          cell_v_max: round(approach(b.cell_v_max ?? 3.23, 3.228, 0.15), 3),
          hvac_ok: true,
          envelope: {
            ...b.envelope,
            max_discharge_kW: Math.round(approach(b.envelope?.max_discharge_kW ?? 2500, 2500, 0.2)),
          },
        },
      };
    });
  }

  return next;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Applies every scenario due at time `ctl.t`, then returns the new frame.
 * Mutates `ctl` (fired set, queue) — it is session control state, not frame data.
 */
export function applyScenarios(state: SiteState, ctl: SimControl): SiteState {
  let next = state;

  if (ctl.pendingReconnect) {
    ctl.pendingReconnect = false;
    next = reconnectSkid5(next);
  }

  // --- scripted timeline ---
  if (ctl.t >= TIMELINE.skid2CoolStart_s) next = coolSkid2(next);

  if (ctl.t >= TIMELINE.burst_s && !ctl.fired.has('burst')) {
    ctl.fired.add('burst');
    ctl.burstUntil_s = TIMELINE.burstClear_s;
  }

  if (ctl.t >= TIMELINE.skid5Reconnect_s && !ctl.fired.has('reconnect')) {
    ctl.fired.add('reconnect');
    next = reconnectSkid5(next);
  }

  // --- burst hold / release ---
  if (ctl.burstUntil_s != null) {
    if (ctl.t < ctl.burstUntil_s) {
      next = applyBurst(next);
    } else {
      next = clearBurst(next);
      // Hold the clearing ramp a few seconds past expiry so it eases back rather than snapping.
      if (ctl.t > ctl.burstUntil_s + 6) ctl.burstUntil_s = null;
    }
  }

  return { ...next, stale: ctl.dropout };
}
