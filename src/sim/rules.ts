/**
 * Rule engine — derives asset state and alarms from raw telemetry.
 *
 * Data-driven over the alarm catalog, deliberately not per-asset branches. Two payoffs:
 * adding a rule is a table entry, and the rule that fired IS the plain-language explanation
 * (Stage 4) and the derate reason (Stage 3).
 *
 * Pure. No React, no clock, no randomness.
 */

import { ALARM_CATALOG, THRESHOLDS, SEVERITY_ORDER, DEADBAND } from '../domain/alarmCatalog';
import type { AlarmRule, RuleGroup } from '../domain/alarmCatalog';
import type {
  Alarm,
  AlarmCode,
  AssetState,
  BatteryTelemetry,
  PcsTelemetry,
  SubstationMetrics,
  TransformerTelemetry,
} from '../domain/types';

/** A candidate alarm before severity-ladder suppression. */
interface Candidate {
  code: AlarmCode;
  /** The measured value that tripped the rule — used to build the message. */
  value: number;
  /** Formats the operator-facing message. */
  format: (value: number) => string;
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);

/**
 * Codes currently active on this asset. Passing them in enables hysteresis: a live alarm
 * holds until the value travels back past its threshold by the deadband.
 */
export type ActiveCodes = ReadonlySet<AlarmCode> | undefined;

/**
 * "Value is above the limit" with hysteresis.
 *
 * Firing uses the raw limit; CLEARING requires the value to fall a deadband below it. Without
 * this an alarm sitting a hair over its threshold toggles on every jitter step.
 */
function over(v: number, limit: number, band: number, code: AlarmCode, active: ActiveCodes) {
  return active?.has(code) ? v > limit - band : v > limit;
}

/** "Value is below the limit" with hysteresis, mirrored. */
function under(v: number, limit: number, band: number, code: AlarmCode, active: ActiveCodes) {
  return active?.has(code) ? v < limit + band : v < limit;
}

/**
 * Battery rules. Each returns a candidate when tripped.
 *
 * Note every guard is `!= null` rather than truthy — a legitimate 0 (SoC 0%, 0 strings online)
 * must still be evaluated, and `undefined` must never be compared numerically.
 */
function batteryCandidates(b: BatteryTelemetry, active: ActiveCodes): Candidate[] {
  const out: Candidate[] = [];

  if (b.cell_v_max != null) {
    if (over(b.cell_v_max, THRESHOLDS.cell_v_max_crit, DEADBAND.cell_v, 'CELL_OV', active)) {
      out.push({
        code: 'CELL_OV',
        value: b.cell_v_max,
        format: (v) => `Cell overvoltage - max cell at ${f3(v)} V`,
      });
    } else if (over(b.cell_v_max, THRESHOLDS.cell_v_max_warn, DEADBAND.cell_v, 'CELL_OV_WARN', active)) {
      out.push({
        code: 'CELL_OV_WARN',
        value: b.cell_v_max,
        format: (v) => `Cell approaching overvoltage (max ${f3(v)} V)`,
      });
    }
  }

  if (b.cell_v_min != null) {
    if (under(b.cell_v_min, THRESHOLDS.cell_v_min_crit, DEADBAND.cell_v, 'CELL_UV', active)) {
      out.push({
        code: 'CELL_UV',
        value: b.cell_v_min,
        format: (v) => `Cell undervoltage - min cell at ${f3(v)} V`,
      });
    } else if (under(b.cell_v_min, THRESHOLDS.cell_v_min_warn, DEADBAND.cell_v, 'CELL_UV_WARN', active)) {
      out.push({
        code: 'CELL_UV_WARN',
        value: b.cell_v_min,
        format: (v) => `Cell approaching undervoltage (min ${f3(v)} V)`,
      });
    }
  }

  if (b.cell_temp_max_C != null) {
    if (over(b.cell_temp_max_C, THRESHOLDS.cell_temp_crit_C, DEADBAND.cell_temp_C, 'TEMP_CRIT', active)) {
      out.push({
        code: 'TEMP_CRIT',
        value: b.cell_temp_max_C,
        format: (v) => `Battery over-temperature (max ${f1(v)} C) - derate or stop`,
      });
    } else if (over(b.cell_temp_max_C, THRESHOLDS.cell_temp_warn_C, DEADBAND.cell_temp_C, 'TEMP_HIGH', active)) {
      out.push({
        code: 'TEMP_HIGH',
        value: b.cell_temp_max_C,
        format: (v) => `Battery module temperature elevated (max ${f1(v)} C)`,
      });
    }
  }

  if (
    b.cell_temp_delta_C != null &&
    over(b.cell_temp_delta_C, THRESHOLDS.cell_temp_delta_warn_C, DEADBAND.cell_temp_delta_C, 'TEMP_DELTA', active)
  ) {
    out.push({
      code: 'TEMP_DELTA',
      value: b.cell_temp_delta_C,
      format: (v) => `Cell temperature spread ${f1(v)} C - thermal imbalance`,
    });
  }

  if (b.soc_pct != null && under(b.soc_pct, THRESHOLDS.soc_low_pct, DEADBAND.soc_pct, 'SOC_LOW', active)) {
    out.push({
      code: 'SOC_LOW',
      value: b.soc_pct,
      format: (v) => `State of charge low (${f1(v)} %)`,
    });
  }

  if (b.insulation_MOhm != null) {
    if (under(b.insulation_MOhm, THRESHOLDS.insulation_crit_MOhm, DEADBAND.insulation_MOhm, 'INSULATION_CRIT', active)) {
      out.push({
        code: 'INSULATION_CRIT',
        value: b.insulation_MOhm,
        format: (v) => `Insulation critical at ${f2(v)} MOhm - ground-fault risk`,
      });
    } else if (under(b.insulation_MOhm, THRESHOLDS.insulation_low_MOhm, DEADBAND.insulation_MOhm, 'INSULATION_LOW', active)) {
      out.push({
        code: 'INSULATION_LOW',
        value: b.insulation_MOhm,
        format: (v) => `Insulation degraded to ${f2(v)} MOhm`,
      });
    }
  }

  if (b.current_A != null && over(b.current_A, THRESHOLDS.dc_overcurrent_A, DEADBAND.current_A, 'DC_OVERCURRENT', active)) {
    out.push({
      code: 'DC_OVERCURRENT',
      value: b.current_A,
      format: (v) => `DC overcurrent - ${Math.round(v)} A exceeds rating`,
    });
  }

  if (b.soh_pct != null && under(b.soh_pct, THRESHOLDS.soh_degraded_pct, DEADBAND.soh_pct, 'SOH_DEGRADED', active)) {
    out.push({
      code: 'SOH_DEGRADED',
      value: b.soh_pct,
      format: (v) => `State of health ${f1(v)} % - end of life approaching`,
    });
  }

  // hvac_ok is simulator-injected; the catalog lists HVAC_FAULT with no backing schema field.
  if (b.hvac_ok === false) {
    out.push({
      code: 'HVAC_FAULT',
      value: 0,
      format: () => 'Cooling system fault - thermal management degraded',
    });
  }

  return out;
}

function pcsCandidates(p: PcsTelemetry, active: ActiveCodes): Candidate[] {
  const out: Candidate[] = [];

  // The catalog has no IGBT code, but the schema documents "warn > 75". Surface it as a
  // thermal-management warning rather than inventing a code outside the catalog.
  if (p.igbt_temp_C != null && over(p.igbt_temp_C, THRESHOLDS.igbt_temp_warn_C, DEADBAND.igbt_temp_C, 'HVAC_FAULT', active)) {
    out.push({
      code: 'HVAC_FAULT',
      value: p.igbt_temp_C,
      format: (v) => `Inverter IGBT temperature ${f1(v)} C - cooling degraded`,
    });
  }

  return out;
}

function substationCandidates(m: SubstationMetrics, active: ActiveCodes): Candidate[] {
  const out: Candidate[] = [];

  if (
    m.frequency_Hz != null &&
    (under(m.frequency_Hz, THRESHOLDS.grid_freq_min_Hz, DEADBAND.frequency_Hz, 'GRID_FREQ', active) ||
      over(m.frequency_Hz, THRESHOLDS.grid_freq_max_Hz, DEADBAND.frequency_Hz, 'GRID_FREQ', active))
  ) {
    out.push({
      code: 'GRID_FREQ',
      value: m.frequency_Hz,
      format: (v) => `Grid frequency excursion - ${f2(v)} Hz`,
    });
  }

  return out;
}

/**
 * Severity-ladder suppression: within a group only the highest-ranked match survives.
 *
 * Emitting CELL_OV alongside CELL_OV_WARN is exactly the redundant noise Stage 1 exists to
 * eliminate, and a reviewer reading the alarm list will spot it immediately.
 */
function suppressLadder(candidates: Candidate[]): Candidate[] {
  const bestByGroup = new Map<RuleGroup, Candidate>();
  const ungrouped: Candidate[] = [];

  for (const c of candidates) {
    const rule = ALARM_CATALOG[c.code];
    if (rule.group === null) {
      ungrouped.push(c);
      continue;
    }
    const held = bestByGroup.get(rule.group);
    if (held === undefined || rule.rank > ALARM_CATALOG[held.code].rank) {
      bestByGroup.set(rule.group, c);
    }
  }

  return [...bestByGroup.values(), ...ungrouped];
}

function toAlarm(c: Candidate): Alarm {
  const rule: AlarmRule = ALARM_CATALOG[c.code];
  return { code: c.code, severity: rule.severity, message: c.format(c.value) };
}

/** critical first, then stable by code so the list doesn't reshuffle between ticks. */
export function sortAlarms(alarms: Alarm[]): Alarm[] {
  return [...alarms].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code),
  );
}

/**
 * Worst-wins rollup.
 *
 * OFFLINE outranks everything: an offline asset carries a *critical* COMMS_LOST, but the brief's
 * own snapshot gives SKID-5 state OFFLINE rather than FAULT. Deriving FAULT there would
 * contradict the provided data.
 */
export function rollUpState(alarms: Alarm[], offline: boolean): AssetState {
  if (offline) return 'OFFLINE';
  if (alarms.some((a) => a.severity === 'critical')) return 'FAULT';
  if (alarms.some((a) => a.severity === 'warning')) return 'WARNING';
  return 'NORMAL';
}

export interface Evaluation {
  state: AssetState;
  alarms: Alarm[];
}

/** Evaluate one subsystem in isolation, so the drawer can show per-subsystem state. */
function evaluate(candidates: Candidate[], offline: boolean): Evaluation {
  const alarms = sortAlarms(suppressLadder(candidates).map(toAlarm));
  return { state: rollUpState(alarms, offline), alarms };
}

export interface SkidEvaluation extends Evaluation {
  pcsState: AssetState;
  batteryState: AssetState;
  transformerState: AssetState;
}

/**
 * Evaluate a whole skid. An offline skid (no telemetry at all) short-circuits to COMMS_LOST —
 * thresholds must not be applied to absent data.
 */
export function evaluateSkid(
  skid: {
    pcs: PcsTelemetry | null;
    battery: BatteryTelemetry | null;
    transformer: TransformerTelemetry | null;
  },
  active?: ActiveCodes,
): SkidEvaluation {
  const offline = skid.pcs === null && skid.battery === null && skid.transformer === null;

  if (offline) {
    return {
      state: 'OFFLINE',
      alarms: [
        {
          code: 'COMMS_LOST',
          severity: 'critical',
          message: 'No telemetry received from skid',
        },
      ],
      pcsState: 'OFFLINE',
      batteryState: 'OFFLINE',
      transformerState: 'OFFLINE',
    };
  }

  const battery = evaluate(skid.battery ? batteryCandidates(skid.battery, active) : [], skid.battery === null);
  const pcs = evaluate(skid.pcs ? pcsCandidates(skid.pcs, active) : [], skid.pcs === null);
  // The catalog has no transformer rules; it reports its own state.
  const transformerState: AssetState = skid.transformer?.state ?? 'OFFLINE';

  const alarms = sortAlarms([...battery.alarms, ...pcs.alarms]);

  return {
    state: rollUpState(alarms, false),
    alarms,
    pcsState: pcs.state,
    batteryState: battery.state,
    transformerState,
  };
}

export function evaluateSubstation(metrics: SubstationMetrics, active?: ActiveCodes): Evaluation {
  return evaluate(substationCandidates(metrics, active), false);
}

/** The data-center load reports no alarmable telemetry in the catalog. */
export function evaluateLoad(): Evaluation {
  return { state: 'NORMAL', alarms: [] };
}

// ---------------------------------------------------------------------------
// Derate attribution — Stage 3 "why", Stage 4 explanation
// ---------------------------------------------------------------------------

/**
 * Which alarm a derate should be attributed to, most-root-cause first.
 *
 * Ordered by causation, NOT by severity or alphabetically. A hot module and a wide cell
 * spread usually appear together and are both warnings, but the absolute temperature is the
 * cause and the spread is its symptom — telling an operator "cell temperatures have drifted
 * apart" when a module is sitting at 41 °C sends them after the wrong thing.
 */
const DERATE_PRIORITY: AlarmCode[] = [
  // Critical causes first.
  'TEMP_CRIT',
  'INSULATION_CRIT',
  'DC_OVERCURRENT',
  'CELL_OV',
  'CELL_UV',
  // Then warnings, root cause before symptom.
  'TEMP_HIGH',
  'HVAC_FAULT',
  'TEMP_DELTA',
  'INSULATION_LOW',
  'CELL_OV_WARN',
  'CELL_UV_WARN',
  'SOH_DEGRADED',
  'SOC_LOW',
];

/**
 * The alarm responsible for a derated envelope.
 * This is the payoff of keeping rules data-driven — no separate explanation table.
 */
export function derateCause(alarms: Alarm[]): Alarm | null {
  let best: Alarm | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const alarm of alarms) {
    const rank = DERATE_PRIORITY.indexOf(alarm.code);
    if (rank === -1) continue;
    if (rank < bestRank) {
      bestRank = rank;
      best = alarm;
    }
  }

  return best;
}

/** Headroom against the operating envelope. Returns null when the inputs aren't available. */
export function headroom(battery: BatteryTelemetry | null, nameplate_kW: number) {
  if (battery?.envelope?.max_discharge_kW == null || battery.power_kW == null) return null;

  const envelope_kW = battery.envelope.max_discharge_kW;
  const output_kW = Math.abs(battery.power_kW);

  return {
    envelope_kW,
    output_kW,
    /** How much more the battery may deliver right now. */
    headroom_kW: Math.max(0, envelope_kW - output_kW),
    /** How far the envelope sits below nameplate. 0 means not derated. */
    derate_kW: Math.max(0, nameplate_kW - envelope_kW),
    isDerated: envelope_kW < nameplate_kW,
  };
}
