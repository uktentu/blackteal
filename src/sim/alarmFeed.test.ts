/**
 * Alarm console feed tests — Stage 1 logic.
 *
 * Flood grouping is the judgement call the brief is really testing, so these assert not just
 * that grouping happens, but that it happens at the right threshold and doesn't destroy
 * information below it.
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../domain/snapshot';
import type { Alarm, SiteState, SkidAsset } from '../domain/types';
import { groupAlarms, alarmCounts, FLOOD_THRESHOLD } from './alarmFeed';

const NO_OPTS = {
  acknowledged: new Set<string>(),
  shelved: new Set<string>(),
  filters: { assetId: null, severity: null, showShelved: true },
};

/** Build a site where the listed skids each carry the given alarms. */
function siteWith(spec: Record<string, Alarm[]>): SiteState {
  const assets = { ...INITIAL_SNAPSHOT.assets };
  for (const [id, alarms] of Object.entries(spec)) {
    assets[id] = { ...(assets[id] as SkidAsset), alarms, state: 'WARNING' };
  }
  // Clear the snapshot's own alarms so each test starts from a known baseline.
  for (const id of Object.keys(assets)) {
    if (!(id in spec)) assets[id] = { ...assets[id], alarms: [], state: 'NORMAL' };
  }
  return { ...INITIAL_SNAPSHOT, assets };
}

const warn = (code: Alarm['code'], message = 'msg'): Alarm => ({ code, severity: 'warning', message });
const crit = (code: Alarm['code'], message = 'msg'): Alarm => ({ code, severity: 'critical', message });

describe('flood grouping', () => {
  it('rolls the same code across 3+ assets into one counted row', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH')],
      'SKID-2': [warn('TEMP_HIGH')],
      'SKID-3': [warn('TEMP_HIGH')],
      'SKID-4': [warn('TEMP_HIGH')],
    });

    const groups = groupAlarms(site, NO_OPTS);
    expect(groups).toHaveLength(1);
    expect(groups[0].grouped).toBe(true);
    expect(groups[0].count).toBe(4);
    expect(groups[0].assetId).toBeNull();
  });

  it('keeps individual rows below the threshold, where the asset identity is the information', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH')],
      'SKID-2': [warn('TEMP_HIGH')],
    });

    const groups = groupAlarms(site, NO_OPTS);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.grouped)).toBe(true);
    expect(groups.map((g) => g.assetId).sort()).toEqual(['SKID-1', 'SKID-2']);
  });

  it('groups per code, not across codes', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH'), warn('TEMP_DELTA')],
      'SKID-2': [warn('TEMP_HIGH'), warn('TEMP_DELTA')],
      'SKID-3': [warn('TEMP_HIGH'), warn('TEMP_DELTA')],
    });

    const groups = groupAlarms(site, NO_OPTS);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.code))).toEqual(new Set(['TEMP_HIGH', 'TEMP_DELTA']));
    expect(groups.every((g) => g.count === 3)).toBe(true);
  });

  it('names the assets in a grouped row so the roll-up stays actionable', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH')],
      'SKID-2': [warn('TEMP_HIGH')],
      'SKID-3': [warn('TEMP_HIGH')],
    });

    const [group] = groupAlarms(site, NO_OPTS);
    expect(group.message).toContain('SKID-1');
    expect(group.message).toContain('SKID-3');
  });

  it('collapses a 15+ alarm burst into a handful of rows', () => {
    const codes = ['TEMP_HIGH', 'TEMP_DELTA', 'INSULATION_LOW'] as const;
    const site = siteWith(
      Object.fromEntries(
        ['SKID-1', 'SKID-2', 'SKID-3', 'SKID-4', 'SKID-6'].map((id) => [
          id,
          codes.map((c) => warn(c)),
        ]),
      ),
    );

    const groups = groupAlarms(site, NO_OPTS);
    const total = groups.reduce((n, g) => n + g.count, 0);

    expect(total).toBe(15);
    expect(groups).toHaveLength(3); // one row per code — not a wall of fifteen
  });

  it('uses a threshold of 3', () => {
    expect(FLOOD_THRESHOLD).toBe(3);
  });
});

describe('priority sort', () => {
  it('puts critical above warning', () => {
    const site = siteWith({ 'SKID-1': [warn('TEMP_HIGH')], 'SKID-2': [crit('CELL_OV')] });
    const groups = groupAlarms(site, NO_OPTS);
    expect(groups[0].severity).toBe('critical');
  });

  it('sinks shelved rows below active ones regardless of severity', () => {
    const site = siteWith({ 'SKID-1': [crit('CELL_OV')], 'SKID-2': [warn('TEMP_HIGH')] });
    const groups = groupAlarms(site, {
      ...NO_OPTS,
      shelved: new Set(['SKID-1:CELL_OV']),
    });

    expect(groups[0].shelved).toBe(false);
    expect(groups[groups.length - 1].shelved).toBe(true);
  });

  it('sinks acknowledged rows below unacknowledged ones', () => {
    const site = siteWith({ 'SKID-1': [crit('CELL_OV')], 'SKID-2': [crit('CELL_UV')] });
    const groups = groupAlarms(site, {
      ...NO_OPTS,
      acknowledged: new Set(['SKID-1:CELL_OV']),
    });

    expect(groups[0].acknowledged).toBe(false);
    expect(groups[1].acknowledged).toBe(true);
  });

  it('is stable across identical inputs, so rows do not reshuffle each tick', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH')],
      'SKID-2': [warn('TEMP_DELTA')],
      'SKID-3': [crit('CELL_OV')],
    });
    expect(groupAlarms(site, NO_OPTS).map((g) => g.id)).toEqual(
      groupAlarms(site, NO_OPTS).map((g) => g.id),
    );
  });
});

describe('filters', () => {
  const site = siteWith({
    'SKID-1': [warn('TEMP_HIGH')],
    'SKID-2': [crit('CELL_OV')],
    'SKID-3': [warn('TEMP_DELTA')],
  });

  it('filters by asset', () => {
    const groups = groupAlarms(site, { ...NO_OPTS, filters: { ...NO_OPTS.filters, assetId: 'SKID-2' } });
    expect(groups).toHaveLength(1);
    expect(groups[0].assetId).toBe('SKID-2');
  });

  it('filters by severity', () => {
    const groups = groupAlarms(site, {
      ...NO_OPTS,
      filters: { ...NO_OPTS.filters, severity: 'critical' },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].code).toBe('CELL_OV');
  });

  it('can hide shelved rows, but shows them by default', () => {
    const shelved = new Set(['SKID-1:TEMP_HIGH']);
    expect(groupAlarms(site, { ...NO_OPTS, shelved })).toHaveLength(3);
    expect(
      groupAlarms(site, { ...NO_OPTS, shelved, filters: { ...NO_OPTS.filters, showShelved: false } }),
    ).toHaveLength(2);
  });
});

describe('group ack/shelve semantics', () => {
  it('marks a group handled only when every member is', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH')],
      'SKID-2': [warn('TEMP_HIGH')],
      'SKID-3': [warn('TEMP_HIGH')],
    });

    const partial = groupAlarms(site, { ...NO_OPTS, acknowledged: new Set(['SKID-1:TEMP_HIGH']) });
    expect(partial[0].acknowledged).toBe(false);

    const all = groupAlarms(site, {
      ...NO_OPTS,
      acknowledged: new Set(['SKID-1:TEMP_HIGH', 'SKID-2:TEMP_HIGH', 'SKID-3:TEMP_HIGH']),
    });
    expect(all[0].acknowledged).toBe(true);
  });
});

describe('header counts', () => {
  it('counts occurrences rather than rows, so a flood is not undercounted', () => {
    const site = siteWith({
      'SKID-1': [warn('TEMP_HIGH')],
      'SKID-2': [warn('TEMP_HIGH')],
      'SKID-3': [warn('TEMP_HIGH')],
      'SKID-4': [crit('CELL_OV')],
    });

    const counts = alarmCounts(groupAlarms(site, NO_OPTS));
    expect(counts.warning).toBe(3);
    expect(counts.critical).toBe(1);
  });

  it('excludes shelved alarms from the active counts', () => {
    const site = siteWith({ 'SKID-1': [crit('CELL_OV')], 'SKID-2': [warn('TEMP_HIGH')] });
    const counts = alarmCounts(groupAlarms(site, { ...NO_OPTS, shelved: new Set(['SKID-1:CELL_OV']) }));

    expect(counts.critical).toBe(0);
    expect(counts.shelved).toBe(1);
  });

  it('reflects the brief snapshot: 1 critical, 2 warnings', () => {
    const counts = alarmCounts(groupAlarms(INITIAL_SNAPSHOT, NO_OPTS));
    expect(counts.critical).toBe(1); // SKID-5 COMMS_LOST
    expect(counts.warning).toBe(2); // SKID-2 TEMP_HIGH + TEMP_DELTA
  });
});
