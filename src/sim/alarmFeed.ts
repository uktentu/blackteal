/**
 * Alarm console feed: flatten, filter, group floods, and priority-sort.
 *
 * Pure — no React, no store. The grouping rule is the point of Stage 1: real operators can act
 * on ~6-12 alarms/hour, so fifteen rows arriving at once is not information, it is noise.
 */

import { SEVERITY_ORDER } from '../domain/alarmCatalog';
import type { Alarm, AlarmCode, Severity, SiteState } from '../domain/types';

export interface AlarmEntry {
  assetId: string;
  alarm: Alarm;
  acknowledged: boolean;
  shelved: boolean;
  /** Wall-clock ms at which this shelve expires; null when not shelved. */
  shelvedUntil: number | null;
}

export interface AlarmGroup {
  /** Stable identity across ticks so React keys and CSS transitions behave. */
  id: string;
  code: AlarmCode;
  severity: Severity;
  /** Every occurrence rolled into this row. */
  entries: AlarmEntry[];
  count: number;
  /** True when this row represents several assets rolled together. */
  grouped: boolean;
  /** Single asset id when count === 1, otherwise null. */
  assetId: string | null;
  message: string;
  /** A group is acknowledged/shelved only when every member is. */
  acknowledged: boolean;
  shelved: boolean;
  /** Soonest expiry among the group's members, for the countdown. */
  shelvedUntil: number | null;
}

export interface FeedOptions {
  acknowledged: Set<string>;
  /** key -> wall-clock ms at which the shelve expires. Shelving is always time-boxed. */
  shelvedUntil: Map<string, number>;
  filters: { assetId: string | null; severity: Severity | null; showShelved: boolean };
}

const key = (assetId: string, code: string) => `${assetId}:${code}`;

/**
 * Alarms of the same code across 3+ assets are a flood and roll into one counted row.
 *
 * Below that threshold, individual rows carry more information than a group does — an operator
 * seeing "TEMP_HIGH x2" learns less than seeing which two skids. The whole judgement of Stage 1
 * is where that line sits.
 */
export const FLOOD_THRESHOLD = 3;

export function groupAlarms(site: SiteState, opts: FeedOptions): AlarmGroup[] {
  const { acknowledged, shelvedUntil, filters } = opts;

  // --- flatten ---
  const entries: AlarmEntry[] = [];
  for (const [assetId, asset] of Object.entries(site.assets)) {
    for (const alarm of asset.alarms) {
      const until = shelvedUntil.get(key(assetId, alarm.code)) ?? null;
      entries.push({
        assetId,
        alarm,
        acknowledged: acknowledged.has(key(assetId, alarm.code)),
        shelved: until !== null,
        shelvedUntil: until,
      });
    }
  }

  // --- filter ---
  const filtered = entries.filter((e) => {
    if (filters.assetId !== null && e.assetId !== filters.assetId) return false;
    if (filters.severity !== null && e.alarm.severity !== filters.severity) return false;
    if (!filters.showShelved && e.shelved) return false;
    return true;
  });

  // --- group by code ---
  const byCode = new Map<AlarmCode, AlarmEntry[]>();
  for (const e of filtered) {
    const held = byCode.get(e.alarm.code);
    if (held) held.push(e);
    else byCode.set(e.alarm.code, [e]);
  }

  const groups: AlarmGroup[] = [];

  for (const [code, list] of byCode) {
    const severity = list[0].alarm.severity;

    if (list.length >= FLOOD_THRESHOLD) {
      const assets = list.map((e) => e.assetId).sort();
      groups.push({
        id: `group:${code}`,
        code,
        severity,
        entries: list,
        count: list.length,
        grouped: true,
        assetId: null,
        message: `${list[0].alarm.message} — ${assets.length} assets: ${assets.join(', ')}`,
        // A group only counts as handled when every member is.
        acknowledged: list.every((e) => e.acknowledged),
        shelved: list.every((e) => e.shelved),
        shelvedUntil: soonestExpiry(list),
      });
      continue;
    }

    for (const e of list) {
      groups.push({
        id: key(e.assetId, code),
        code,
        severity,
        entries: [e],
        count: 1,
        grouped: false,
        assetId: e.assetId,
        message: e.alarm.message,
        acknowledged: e.acknowledged,
        shelved: e.shelved,
        shelvedUntil: e.shelvedUntil,
      });
    }
  }

  // --- priority sort ---
  // Shelved sinks to the bottom (it is silenced, not resolved), then unacknowledged above
  // acknowledged, then critical above warning, then floods above singles, then stable by id.
  return groups.sort(
    (a, b) =>
      Number(a.shelved) - Number(b.shelved) ||
      Number(a.acknowledged) - Number(b.acknowledged) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.count - a.count ||
      a.id.localeCompare(b.id),
  );
}

/** Soonest expiry in a group, so the countdown shows when the first member wakes up. */
function soonestExpiry(list: AlarmEntry[]): number | null {
  const times = list.map((e) => e.shelvedUntil).filter((t): t is number => t !== null);
  return times.length === 0 ? null : Math.min(...times);
}

/** Header counts. Shelved alarms are excluded — that is what shelving means. */
export function alarmCounts(groups: AlarmGroup[]) {
  const active = groups.filter((g) => !g.shelved);
  return {
    critical: active.filter((g) => g.severity === 'critical').reduce((n, g) => n + g.count, 0),
    warning: active.filter((g) => g.severity === 'warning').reduce((n, g) => n + g.count, 0),
    shelved: groups.filter((g) => g.shelved).reduce((n, g) => n + g.count, 0),
    unacknowledged: active.filter((g) => !g.acknowledged).reduce((n, g) => n + g.count, 0),
  };
}
