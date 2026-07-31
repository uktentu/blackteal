/**
 * Alarm event log.
 *
 * The gap this closes: with only *active* alarms on screen, an alarm that fires and clears
 * between two glances leaves no trace at all. An operator coming back from a break cannot
 * answer "what happened while I was away", and in a regulated plant the event log is a
 * compliance artefact, not a convenience.
 *
 * Pure: `diffAlarms` compares two frames and returns the transitions. No React, no clock —
 * the caller supplies the timestamp so the whole thing stays deterministic under test.
 */

import type { AlarmCode, Severity, SiteState } from '../domain/types';

export type EventKind = 'raised' | 'cleared' | 'acknowledged' | 'shelved' | 'unshelved';

export interface AlarmEvent {
  /** Monotonic id — stable React key, and a tiebreaker for equal timestamps. */
  seq: number;
  at: number;
  kind: EventKind;
  assetId: string;
  code: AlarmCode;
  severity: Severity;
  message: string;
}

/** Ring-buffer cap. Enough for a shift at realistic alarm rates; bounded so memory can't run. */
export const HISTORY_LIMIT = 500;

const key = (assetId: string, code: string) => `${assetId}:${code}`;

/** Flatten a frame's alarms to `assetId:code` -> details. */
export function activeMap(site: SiteState) {
  const map = new Map<string, { assetId: string; code: AlarmCode; severity: Severity; message: string }>();
  for (const [assetId, asset] of Object.entries(site.assets)) {
    for (const alarm of asset.alarms) {
      map.set(key(assetId, alarm.code), {
        assetId,
        code: alarm.code,
        severity: alarm.severity,
        message: alarm.message,
      });
    }
  }
  return map;
}

/**
 * Transitions between two frames.
 *
 * Both directions matter. A `raised` without its matching `cleared` reads as still-ongoing,
 * which is exactly the ambiguity the log exists to remove.
 */
export function diffAlarms(
  prev: SiteState,
  next: SiteState,
  at: number,
  seqStart: number,
): AlarmEvent[] {
  const before = activeMap(prev);
  const after = activeMap(next);
  const events: AlarmEvent[] = [];
  let seq = seqStart;

  for (const [k, a] of after) {
    if (!before.has(k)) {
      events.push({ seq: seq++, at, kind: 'raised', ...a });
    }
  }

  for (const [k, a] of before) {
    if (!after.has(k)) {
      events.push({ seq: seq++, at, kind: 'cleared', ...a });
    }
  }

  return events;
}

/** Append with a bounded ring buffer, newest last. */
export function appendEvents(log: AlarmEvent[], events: AlarmEvent[]): AlarmEvent[] {
  if (events.length === 0) return log;
  const next = [...log, ...events];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** Newest first, for display. */
export function recent(log: AlarmEvent[], limit = 200): AlarmEvent[] {
  return log.slice(Math.max(0, log.length - limit)).reverse();
}

/** Events for one asset — powers the drawer's per-asset history. */
export function forAsset(log: AlarmEvent[], assetId: string, limit = 30): AlarmEvent[] {
  const out: AlarmEvent[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < limit; i--) {
    if (log[i].assetId === assetId) out.push(log[i]);
  }
  return out;
}

export const EVENT_LABEL: Record<EventKind, string> = {
  raised: 'Raised',
  cleared: 'Cleared',
  acknowledged: 'Acknowledged',
  shelved: 'Shelved',
  unshelved: 'Unshelved',
};
