/**
 * Metric formatting. The single chokepoint through which every number reaches the DOM.
 *
 * The brief grades "missing metrics" as a named edge case, and the provided snapshot is
 * deliberately heterogeneous (SKID-3/4/6 omit three PCS fields; SKID-5 is entirely null).
 * A reviewer opening SKID-3 and seeing `Efficiency: 0%` or `NaN%` is the exact failure this
 * module exists to prevent — an absent metric is NOT zero, and must never render as one.
 */

/** What the UI shows when a metric is genuinely absent. */
export const NO_DATA = '—';

export function isMissing(v: number | null | undefined): boolean {
  return v == null || Number.isNaN(v);
}

/**
 * Format a metric, or return NO_DATA. Never coerces absent to 0.
 * `0` itself is a legitimate value and formats normally.
 */
export function fmt(v: number | null | undefined, dp = 1): string {
  return isMissing(v) ? NO_DATA : v!.toFixed(dp);
}

/** kW shown as MW, which is how an operator thinks about a 2.5 MW skid. */
export function fmtMW(kW: number | null | undefined, dp = 2): string {
  return isMissing(kW) ? NO_DATA : (kW! / 1000).toFixed(dp);
}

export function fmtInt(v: number | null | undefined): string {
  return isMissing(v) ? NO_DATA : Math.round(v!).toLocaleString('en-US');
}

/**
 * Sign-aware power description. `-` is discharge/export, `+` is charge/import.
 * Getting this backwards inverts the story the whole diagram tells while every number
 * still looks plausible, so it lives in one place.
 */
export function powerDirection(kW: number | null | undefined): 'charging' | 'discharging' | 'idle' | null {
  if (isMissing(kW)) return null;
  if (Math.abs(kW!) < 1) return 'idle';
  return kW! > 0 ? 'charging' : 'discharging';
}

export function gridDirection(MW: number | null | undefined): 'import' | 'export' | null {
  if (isMissing(MW)) return null;
  return MW! >= 0 ? 'import' : 'export';
}

/** "2m 14s ago" — for connection health and last-seen timestamps. */
export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

/** Wall-clock HH:MM:SS — control rooms always show the time. */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Countdown as m:ss, for a time-boxed shelve. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const STATE_LABEL = {
  NORMAL: 'Normal',
  WARNING: 'Warning',
  FAULT: 'Fault',
  OFFLINE: 'Offline',
} as const;
