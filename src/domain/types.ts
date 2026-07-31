/**
 * Telemetry schema — docs/BRIEF.md §4.
 *
 * Every metric field is OPTIONAL by design. The provided snapshot is deliberately
 * heterogeneous (SKID-3/4/6 omit three PCS fields; SKID-5 is entirely null), and handling
 * missing metrics is an explicitly graded edge case. Do not tighten these to required.
 */

export type AssetState = 'NORMAL' | 'WARNING' | 'FAULT' | 'OFFLINE';
export type Severity = 'warning' | 'critical';
export type AssetType = 'substation' | 'skid' | 'load';
export type PcsMode = 'CHARGE' | 'DISCHARGE' | 'IDLE' | 'FAULT';

/** Sign convention throughout: + = charge / grid import, - = discharge / export. */

export interface Alarm {
  code: AlarmCode;
  severity: Severity;
  message: string;
}

export interface TopologyAsset {
  id: string;
  type: AssetType;
  label: string;
  x: number;
  y: number;
}

export interface TopologyLink {
  from: string;
  to: string;
}

export interface Topology {
  assets: TopologyAsset[];
  links: TopologyLink[];
}

// ---------------------------------------------------------------------------
// Per-asset telemetry
// ---------------------------------------------------------------------------

/** Substation / grid — normal ranges in docs/BRIEF.md §4. */
export interface SubstationMetrics {
  voltage_kV?: number; // 131-145
  frequency_Hz?: number; // 59.95-60.05
  power_MW?: number; // +/-50, + = import
  power_factor?: number; // 0.95-1.00
  main_tx_oil_temp_C?: number; // 40-75
  main_tx_loading_pct?: number; // 0-100
}

/** Data-center load. */
export interface LoadMetrics {
  power_MW?: number; // 0-40
  it_load_MW?: number; // 0-30
  pue?: number; // 1.2-1.5
  voltage_kV?: number;
}

/** Skid -> inverter (PCS). */
export interface PcsTelemetry {
  state: AssetState;
  power_kW?: number; // -2500..+2500
  mode?: PcsMode;
  ac_voltage_V?: number; // ~690        — absent on SKID-3/4/6
  ac_current_A?: number; // 0-2100      — absent on SKID-3/4/6
  dc_voltage_V?: number; // 1150-1500
  efficiency_pct?: number; // 96-99     — absent on SKID-3/4/6
  igbt_temp_C?: number; // 30-65, warn > 75
}

/** The operating envelope: max power the battery safely allows *right now*. */
export interface Envelope {
  max_charge_kW?: number; // 0-2500
  max_discharge_kW?: number; // 0-2500, derated below the 2500 nameplate when unsafe
}

/** Skid -> battery. */
export interface BatteryTelemetry {
  state: AssetState;
  soc_pct?: number; // 10-95
  soh_pct?: number; // 80-100, warn < 80
  dc_bus_V?: number; // 1150-1500
  current_A?: number; // 0-1900
  power_kW?: number; // -2500..+2500
  c_rate?: number; // 0-0.25
  cell_v_min?: number; // 2.80-3.65
  cell_v_avg?: number;
  cell_v_max?: number;
  cell_temp_min_C?: number; // 15-40, warn > 40
  cell_temp_avg_C?: number;
  cell_temp_max_C?: number;
  cell_temp_delta_C?: number; // 0-8, warn > 8
  insulation_MOhm?: number; // > 1.0
  strings_online?: number; // of 24
  envelope?: Envelope;
  /**
   * Not in the brief's schema — HVAC_FAULT is in the alarm catalog with no backing field.
   * Simulator-injected, used by the alarm-burst scenario. See references/site-data-pack.md.
   */
  hvac_ok?: boolean;
}

/** Skid -> transformer. */
export interface TransformerTelemetry {
  state: AssetState;
  temp_C?: number; // 40-90
  loading_pct?: number; // 0-100
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export interface SubstationAsset {
  state: AssetState;
  metrics: SubstationMetrics;
  alarms: Alarm[];
}

export interface LoadAsset {
  state: AssetState;
  metrics: LoadMetrics;
  alarms: Alarm[];
}

export interface SkidAsset {
  state: AssetState;
  /** null when the skid is offline — comms lost, no telemetry at all. */
  pcs: PcsTelemetry | null;
  battery: BatteryTelemetry | null;
  transformer: TransformerTelemetry | null;
  alarms: Alarm[];
}

export type Asset = SubstationAsset | LoadAsset | SkidAsset;

export function isSkid(a: Asset): a is SkidAsset {
  return 'pcs' in a;
}

/** One frame of the live feed — matches the snapshot in docs/BRIEF.md §6. */
export interface SiteState {
  /** True when the feed has dropped out. Values on screen are last-known, NOT live. */
  stale: boolean;
  assets: Record<string, Asset>;
}

// ---------------------------------------------------------------------------
// Alarm catalog — docs/BRIEF.md §5
// ---------------------------------------------------------------------------

export type AlarmCode =
  | 'CELL_OV_WARN'
  | 'CELL_OV'
  | 'CELL_UV_WARN'
  | 'CELL_UV'
  | 'TEMP_HIGH'
  | 'TEMP_CRIT'
  | 'TEMP_DELTA'
  | 'SOC_LOW'
  | 'INSULATION_LOW'
  | 'INSULATION_CRIT'
  | 'DC_OVERCURRENT'
  | 'COMMS_LOST'
  | 'HVAC_FAULT'
  | 'SOH_DEGRADED'
  | 'GRID_FREQ';
