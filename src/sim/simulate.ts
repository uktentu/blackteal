/**
 * Live-feed simulator. Pure — zero React, no wall clock, no bare Math.random.
 *
 * One tick does exactly four things, in this order:
 *   1. jitter analog telemetry (+/-0.3-0.5%, with a restoring pull toward the anchor)
 *   2. apply scripted scenarios
 *   3. re-solve the power balance
 *   4. re-derive state and alarms from the resulting telemetry
 *
 * Order matters. Balance must come after scenarios, because a scenario that changes skid
 * output has invalidated the grid number. Evaluation must come last, so alarms always describe
 * the telemetry actually being displayed.
 */

import { NAMEPLATE, SKID_IDS } from '../domain/topology';
import type {
  BatteryTelemetry,
  LoadAsset,
  PcsTelemetry,
  SiteState,
  SkidAsset,
  SubstationAsset,
  TransformerTelemetry,
} from '../domain/types';
import { makeRng, jitter, jitterClamped, round, type Rng } from './random';
import { evaluateSkid, evaluateSubstation } from './rules';
import { applyScenarios, type SimControl } from './scenarios';

/** Anchors are the brief's snapshot values — what each metric drifts back toward. */
const ANCHOR = {
  grid_voltage_kV: 138.4,
  grid_frequency_Hz: 60.01,
  grid_pf: 0.994,
  grid_oil_temp_C: 58,
  load_it_MW: 28.5,
  load_pue: 1.33,
  ac_voltage_V: 690,
  igbt_temp_C: 48,
  transformer_temp_C: 62,
} as const;

export const TICK_MS = 1000;

function jitterPcs(rng: Rng, p: PcsTelemetry): PcsTelemetry {
  const next: PcsTelemetry = { ...p };

  if (p.power_kW != null) {
    // Discharge power is anchored to itself: scenarios own the setpoint, jitter only wobbles it.
    next.power_kW = round(jitter(rng, p.power_kW, p.power_kW, 0.004, 0), 0);
  }
  if (p.dc_voltage_V != null) {
    next.dc_voltage_V = round(jitterClamped(rng, p.dc_voltage_V, 1330, 1150, 1500), 0);
  }
  if (p.igbt_temp_C != null) {
    next.igbt_temp_C = round(jitterClamped(rng, p.igbt_temp_C, ANCHOR.igbt_temp_C, 30, 65), 0);
  }
  // Absent on SKID-3/4/6 by design — jitter only what is actually reported.
  if (p.ac_voltage_V != null) {
    next.ac_voltage_V = round(jitterClamped(rng, p.ac_voltage_V, ANCHOR.ac_voltage_V, 676, 704), 0);
  }
  if (p.efficiency_pct != null) {
    next.efficiency_pct = round(jitterClamped(rng, p.efficiency_pct, 98.1, 96, 99), 1);
  }
  // Derived, not jittered: current follows from power and voltage.
  if (next.ac_current_A != null && next.power_kW != null && next.ac_voltage_V != null) {
    next.ac_current_A = round((Math.abs(next.power_kW) * 1000) / (next.ac_voltage_V * Math.sqrt(3)), 0);
  }

  return next;
}

/**
 * Jitter the battery, keeping every dependent field consistent.
 *
 * Only the independent quantities are jittered; current, c-rate, delta and the temperature
 * average are *derived*. Jittering them separately is how simulated telemetry ends up with
 * max < min, or a delta that doesn't equal max - min — obviously fabricated to a reviewer.
 */
function jitterBattery(rng: Rng, b: BatteryTelemetry, pcs_kW: number | undefined): BatteryTelemetry {
  const next: BatteryTelemetry = { ...b };

  if (b.dc_bus_V != null) {
    next.dc_bus_V = round(jitterClamped(rng, b.dc_bus_V, 1330, 1150, 1500), 0);
  }

  // Battery DC power is the PCS AC power grossed up by conversion loss: discharging, the
  // battery gives up slightly more DC than the inverter delivers as AC.
  if (pcs_kW != null) {
    const eff = (b.soh_pct != null ? 0.981 : 0.981) as number;
    next.power_kW = round(pcs_kW / eff, 0);
  } else if (b.power_kW != null) {
    next.power_kW = round(jitter(rng, b.power_kW, b.power_kW, 0.004, 0), 0);
  }

  if (next.power_kW != null && next.dc_bus_V != null && next.dc_bus_V > 0) {
    next.current_A = round((Math.abs(next.power_kW) * 1000) / next.dc_bus_V, 0);
    next.c_rate = round(Math.abs(next.power_kW) / NAMEPLATE.battery_kWh, 2);
  }

  // SoC drains slowly while discharging: kW * (1s/3600s) / kWh capacity.
  // Held at 2dp: a ~2 MW discharge moves SoC by 0.006 %/tick, and rounding to 1dp here would
  // swallow the drain entirely — the battery would never empty.
  if (b.soc_pct != null && next.power_kW != null) {
    const deltaPct = (next.power_kW / 3600 / NAMEPLATE.battery_kWh) * 100;
    next.soc_pct = round(Math.min(95, Math.max(5, b.soc_pct + deltaPct)), 2);
  }

  if (b.soh_pct != null) next.soh_pct = round(jitterClamped(rng, b.soh_pct, b.soh_pct, 80, 100, 0.0005), 1);

  // Scenarios own the temperatures; jitter only wobbles around wherever they left them.
  if (b.cell_temp_max_C != null && b.cell_temp_min_C != null) {
    const max = jitter(rng, b.cell_temp_max_C, b.cell_temp_max_C, 0.003, 0);
    const min = jitter(rng, b.cell_temp_min_C, b.cell_temp_min_C, 0.003, 0);
    next.cell_temp_max_C = round(Math.max(max, min), 1);
    next.cell_temp_min_C = round(Math.min(max, min), 1);
    next.cell_temp_avg_C = round((next.cell_temp_max_C + next.cell_temp_min_C) / 2, 1);
    next.cell_temp_delta_C = round(next.cell_temp_max_C - next.cell_temp_min_C, 1);
  }

  if (b.cell_v_min != null && b.cell_v_max != null && b.cell_v_avg != null) {
    const vmin = jitterClamped(rng, b.cell_v_min, b.cell_v_min, 2.8, 3.65, 0.0008);
    const vmax = jitterClamped(rng, b.cell_v_max, b.cell_v_max, 2.8, 3.65, 0.0008);
    next.cell_v_min = round(Math.min(vmin, vmax), 3);
    next.cell_v_max = round(Math.max(vmin, vmax), 3);
    next.cell_v_avg = round((next.cell_v_min + next.cell_v_max) / 2, 3);
  }

  if (b.insulation_MOhm != null) {
    next.insulation_MOhm = round(jitter(rng, b.insulation_MOhm, b.insulation_MOhm, 0.004, 0), 2);
  }

  return next;
}

function jitterTransformer(rng: Rng, t: TransformerTelemetry, loading: number): TransformerTelemetry {
  return {
    ...t,
    temp_C:
      t.temp_C == null
        ? t.temp_C
        : round(jitterClamped(rng, t.temp_C, ANCHOR.transformer_temp_C, 40, 90), 0),
    loading_pct: round(Math.min(100, Math.max(0, loading)), 0),
  };
}

/**
 * One frame.
 *
 * `ctl` carries session control state (elapsed time, fired one-shots, manual triggers) and is
 * mutated; the returned SiteState is always a fresh object graph so React sees a new reference.
 */
export function simulateFrame(prev: SiteState, ctl: SimControl, seed: number): SiteState {
  const rng = makeRng(seed);

  // --- 1. jitter ---
  const assets: SiteState['assets'] = {};

  for (const id of SKID_IDS) {
    const sk = prev.assets[id] as SkidAsset;

    if (sk.pcs === null || sk.battery === null) {
      assets[id] = sk; // offline: nothing to jitter, and thresholds must not touch absent data
      continue;
    }

    const pcs = jitterPcs(rng, sk.pcs);
    const battery = jitterBattery(rng, sk.battery, pcs.power_kW);
    const loading = (Math.abs(pcs.power_kW ?? 0) / 1000 / NAMEPLATE.skidTransformer_MVA) * 100;
    const transformer =
      sk.transformer === null ? null : jitterTransformer(rng, sk.transformer, loading);

    assets[id] = { ...sk, pcs, battery, transformer };
  }

  const prevSub = prev.assets.SUBSTATION as SubstationAsset;
  const prevLoad = prev.assets.LOAD as LoadAsset;

  const it_load_MW = round(jitterClamped(rng, prevLoad.metrics.it_load_MW ?? 28.5, ANCHOR.load_it_MW, 24, 30), 2);
  const pue = round(jitterClamped(rng, prevLoad.metrics.pue ?? 1.33, ANCHOR.load_pue, 1.2, 1.5, 0.002), 3);

  assets.LOAD = { ...prevLoad, metrics: { ...prevLoad.metrics, it_load_MW, pue } };
  assets.SUBSTATION = {
    ...prevSub,
    metrics: {
      ...prevSub.metrics,
      voltage_kV: round(jitterClamped(rng, prevSub.metrics.voltage_kV ?? 138.4, ANCHOR.grid_voltage_kV, 131, 145), 1),
      frequency_Hz: round(jitterClamped(rng, prevSub.metrics.frequency_Hz ?? 60.01, ANCHOR.grid_frequency_Hz, 59.95, 60.05, 0.0002), 2),
      power_factor: round(jitterClamped(rng, prevSub.metrics.power_factor ?? 0.994, ANCHOR.grid_pf, 0.95, 1), 3),
      main_tx_oil_temp_C: round(jitterClamped(rng, prevSub.metrics.main_tx_oil_temp_C ?? 58, ANCHOR.grid_oil_temp_C, 40, 75), 0),
    },
  };

  // --- 2. scenarios ---
  const scripted = applyScenarios({ ...prev, assets }, ctl);

  // --- 3. re-solve the power balance ---
  const balanced = solveBalance(scripted);

  // --- 4. re-derive state and alarms ---
  return evaluateFrame(balanced);
}

/**
 * grid.power_MW = load.power_MW - SUM(skid discharge)
 *
 * The grid figure is SOLVED, never jittered independently. Jittering all three breaks the
 * balance within seconds, which is the quietest way this requirement fails.
 */
export function solveBalance(state: SiteState): SiteState {
  const load = state.assets.LOAD as LoadAsset;
  const facility_MW = round((load.metrics.it_load_MW ?? 0) * (load.metrics.pue ?? 1), 1);

  // pcs.power_kW is negative while discharging, so negating the sum gives MW delivered.
  const discharge_MW =
    -SKID_IDS.map((id) => (state.assets[id] as SkidAsset).pcs?.power_kW ?? 0).reduce((a, b) => a + b, 0) / 1000;

  const grid_MW = round(facility_MW - discharge_MW, 1);
  const sub = state.assets.SUBSTATION as SubstationAsset;

  return {
    ...state,
    assets: {
      ...state.assets,
      LOAD: { ...load, metrics: { ...load.metrics, power_MW: facility_MW } },
      SUBSTATION: {
        ...sub,
        metrics: {
          ...sub.metrics,
          power_MW: grid_MW,
          main_tx_loading_pct: round((grid_MW / NAMEPLATE.mainTransformer_MVA) * 100, 0),
        },
      },
    },
  };
}

/** Re-derive every asset's state and alarms from its current telemetry. */
export function evaluateFrame(state: SiteState): SiteState {
  const assets: SiteState['assets'] = {};

  for (const id of SKID_IDS) {
    const sk = state.assets[id] as SkidAsset;
    const evaluated = evaluateSkid(sk);
    assets[id] = {
      ...sk,
      state: evaluated.state,
      alarms: evaluated.alarms,
      pcs: sk.pcs && { ...sk.pcs, state: evaluated.pcsState },
      battery: sk.battery && { ...sk.battery, state: evaluated.batteryState },
      transformer: sk.transformer && { ...sk.transformer, state: evaluated.transformerState },
    };
  }

  const sub = state.assets.SUBSTATION as SubstationAsset;
  const subEval = evaluateSubstation(sub.metrics);
  assets.SUBSTATION = { ...sub, state: subEval.state, alarms: subEval.alarms };
  assets.LOAD = state.assets.LOAD;

  return { ...state, assets };
}

/** Aggregate site health for the top strip. */
export function siteSummary(state: SiteState) {
  const values = Object.values(state.assets);
  const critical = values.reduce((n, a) => n + a.alarms.filter((x) => x.severity === 'critical').length, 0);
  const warning = values.reduce((n, a) => n + a.alarms.filter((x) => x.severity === 'warning').length, 0);
  const needsAttention = values.filter((a) => a.state !== 'NORMAL').length;

  const load = state.assets.LOAD as LoadAsset;
  const sub = state.assets.SUBSTATION as SubstationAsset;
  const bess_MW =
    -SKID_IDS.map((id) => (state.assets[id] as SkidAsset).pcs?.power_kW ?? 0).reduce((a, b) => a + b, 0) / 1000;

  return {
    critical,
    warning,
    needsAttention,
    load_MW: load.metrics.power_MW ?? 0,
    grid_MW: sub.metrics.power_MW ?? 0,
    bess_MW: round(bess_MW, 1),
    worst: values.some((a) => a.state === 'FAULT')
      ? ('FAULT' as const)
      : values.some((a) => a.state === 'OFFLINE')
        ? ('OFFLINE' as const)
        : values.some((a) => a.state === 'WARNING')
          ? ('WARNING' as const)
          : ('NORMAL' as const),
  };
}
