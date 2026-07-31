/**
 * Event-log tests.
 *
 * The property that matters: a transition in EITHER direction is recorded. A raised without a
 * matching cleared reads as still-ongoing, which is exactly the ambiguity the log exists to
 * remove.
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../domain/snapshot';
import type { SiteState } from '../domain/types';
import { diffAlarms, appendEvents, recent, forAsset, HISTORY_LIMIT } from './alarmHistory';

const withAlarms = (id: string, codes: string[]): SiteState => {
  const site = structuredClone(INITIAL_SNAPSHOT);
  for (const key of Object.keys(site.assets)) site.assets[key].alarms = [];
  site.assets[id].alarms = codes.map((code) => ({
    code: code as never,
    severity: 'warning' as const,
    message: `${code} message`,
  }));
  return site;
};

const clean = (): SiteState => withAlarms('SKID-1', []);

describe('diffAlarms', () => {
  it('records an alarm appearing', () => {
    const events = diffAlarms(clean(), withAlarms('SKID-1', ['TEMP_HIGH']), 1000, 0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'raised', assetId: 'SKID-1', code: 'TEMP_HIGH' });
  });

  it('records an alarm disappearing — the trace a self-clearing alarm would not leave', () => {
    const events = diffAlarms(withAlarms('SKID-1', ['TEMP_HIGH']), clean(), 2000, 0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'cleared', code: 'TEMP_HIGH' });
  });

  it('emits nothing when nothing changed', () => {
    const a = withAlarms('SKID-1', ['TEMP_HIGH']);
    expect(diffAlarms(a, structuredClone(a), 3000, 0)).toHaveLength(0);
  });

  it('handles a raise and a clear in the same frame', () => {
    const events = diffAlarms(
      withAlarms('SKID-1', ['TEMP_HIGH']),
      withAlarms('SKID-1', ['SOC_LOW']),
      4000,
      0,
    );
    expect(events.map((e) => e.kind).sort()).toEqual(['cleared', 'raised']);
  });

  it('assigns unique increasing sequence numbers', () => {
    const events = diffAlarms(clean(), withAlarms('SKID-1', ['TEMP_HIGH', 'SOC_LOW']), 5000, 10);
    expect(events.map((e) => e.seq)).toEqual([10, 11]);
  });
});

describe('log buffer', () => {
  it('caps growth so a long session cannot exhaust memory', () => {
    let log = [] as ReturnType<typeof diffAlarms>;
    for (let i = 0; i < HISTORY_LIMIT + 120; i++) {
      log = appendEvents(log, diffAlarms(clean(), withAlarms('SKID-1', ['TEMP_HIGH']), i, i));
    }
    expect(log).toHaveLength(HISTORY_LIMIT);
    // The newest survive; the oldest are dropped.
    expect(log[log.length - 1].at).toBe(HISTORY_LIMIT + 119);
  });

  it('returns newest-first for display', () => {
    let log = [] as ReturnType<typeof diffAlarms>;
    log = appendEvents(log, diffAlarms(clean(), withAlarms('SKID-1', ['TEMP_HIGH']), 1, 0));
    log = appendEvents(log, diffAlarms(clean(), withAlarms('SKID-2', ['SOC_LOW']), 2, 1));
    expect(recent(log).map((e) => e.at)).toEqual([2, 1]);
  });

  it('filters to one asset for the drawer', () => {
    let log = [] as ReturnType<typeof diffAlarms>;
    log = appendEvents(log, diffAlarms(clean(), withAlarms('SKID-1', ['TEMP_HIGH']), 1, 0));
    log = appendEvents(log, diffAlarms(clean(), withAlarms('SKID-2', ['SOC_LOW']), 2, 1));
    expect(forAsset(log, 'SKID-2')).toHaveLength(1);
    expect(forAsset(log, 'SKID-2')[0].code).toBe('SOC_LOW');
  });
});
