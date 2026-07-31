/**
 * Guards the transcription of the brief's data pack. These are not tests of our logic — they
 * assert that the *input data* still matches docs/BRIEF.md, including the gaps it deliberately
 * contains. If one of these fails, someone "fixed" the source data.
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from './snapshot';
import { TOPOLOGY, SKID_IDS, NAMEPLATE } from './topology';
import { isSkid, type LoadAsset, type SkidAsset } from './types';

const skid = (id: string) => INITIAL_SNAPSHOT.assets[id] as SkidAsset;

describe('topology', () => {
  it('has the substation, six skids and the load', () => {
    expect(TOPOLOGY.assets).toHaveLength(8);
    expect(SKID_IDS).toEqual(['SKID-1', 'SKID-2', 'SKID-3', 'SKID-4', 'SKID-5', 'SKID-6']);
  });

  it('links every skid to both the substation and the load', () => {
    expect(TOPOLOGY.links).toHaveLength(12);
    for (const id of SKID_IDS) {
      expect(TOPOLOGY.links).toContainEqual({ from: 'SUBSTATION', to: id });
      expect(TOPOLOGY.links).toContainEqual({ from: id, to: 'LOAD' });
    }
  });

  it('references only assets that exist', () => {
    const ids = new Set(TOPOLOGY.assets.map((a) => a.id));
    for (const link of TOPOLOGY.links) {
      expect(ids.has(link.from)).toBe(true);
      expect(ids.has(link.to)).toBe(true);
    }
  });
});

describe('initial snapshot', () => {
  it('covers every topology asset', () => {
    for (const asset of TOPOLOGY.assets) {
      expect(INITIAL_SNAPSHOT.assets[asset.id]).toBeDefined();
    }
  });

  it('starts live, not stale', () => {
    expect(INITIAL_SNAPSHOT.stale).toBe(false);
  });

  it('holds the power balance: grid = load - total discharge', () => {
    const load = 37.9;
    const dischargeMW =
      -SKID_IDS.map((id) => skid(id).pcs?.power_kW ?? 0).reduce((a, b) => a + b, 0) / 1000;

    expect(dischargeMW).toBeCloseTo(9.4, 1);

    const grid = load - dischargeMW;
    expect(grid).toBeCloseTo(28.5, 1);
  });

  it("derives the load's facility power from IT load x PUE", () => {
    const load = INITIAL_SNAPSHOT.assets.LOAD as LoadAsset;
    const { it_load_MW = 0, pue = 0, power_MW = 0 } = load.metrics;
    expect(it_load_MW * pue).toBeCloseTo(power_MW, 0);
  });

  it('discharges on every online skid (negative power, - = discharge)', () => {
    for (const id of SKID_IDS) {
      const pcs = skid(id).pcs;
      if (pcs === null) continue;
      expect(pcs.power_kW).toBeLessThan(0);
      expect(pcs.mode).toBe('DISCHARGE');
      expect(Math.abs(pcs.power_kW!)).toBeLessThanOrEqual(NAMEPLATE.pcs_kW);
    }
  });

  it('keeps cell voltage and temperature triples ordered min <= avg <= max', () => {
    for (const id of SKID_IDS) {
      const b = skid(id).battery;
      if (b === null) continue;
      expect(b.cell_v_min!).toBeLessThanOrEqual(b.cell_v_avg!);
      expect(b.cell_v_avg!).toBeLessThanOrEqual(b.cell_v_max!);
      expect(b.cell_temp_min_C!).toBeLessThanOrEqual(b.cell_temp_avg_C!);
      expect(b.cell_temp_avg_C!).toBeLessThanOrEqual(b.cell_temp_max_C!);
    }
  });

  it('keeps cell_temp_delta_C equal to max - min', () => {
    for (const id of SKID_IDS) {
      const b = skid(id).battery;
      if (b === null) continue;
      expect(b.cell_temp_delta_C!).toBeCloseTo(b.cell_temp_max_C! - b.cell_temp_min_C!, 1);
    }
  });
});

describe('graded edge cases in the source data', () => {
  it('leaves SKID-3, SKID-4 and SKID-6 without the three optional PCS fields', () => {
    for (const id of ['SKID-3', 'SKID-4', 'SKID-6']) {
      const pcs = skid(id).pcs!;
      expect(pcs.ac_voltage_V).toBeUndefined();
      expect(pcs.ac_current_A).toBeUndefined();
      expect(pcs.efficiency_pct).toBeUndefined();
      // ...while the fields that ARE provided stay present.
      expect(pcs.power_kW).toBeDefined();
      expect(pcs.igbt_temp_C).toBeDefined();
    }
  });

  it('leaves SKID-5 fully offline with no telemetry', () => {
    const s = skid('SKID-5');
    expect(s.state).toBe('OFFLINE');
    expect(s.pcs).toBeNull();
    expect(s.battery).toBeNull();
    expect(s.transformer).toBeNull();
  });

  it('reports SKID-5 as OFFLINE even though COMMS_LOST is critical', () => {
    // OFFLINE outranks the severity ladder — deriving FAULT here contradicts the brief.
    const s = skid('SKID-5');
    expect(s.alarms[0].code).toBe('COMMS_LOST');
    expect(s.alarms[0].severity).toBe('critical');
    expect(s.state).toBe('OFFLINE');
  });

  it('derates SKID-2 below nameplate with warnings that explain why', () => {
    const s = skid('SKID-2');
    expect(s.state).toBe('WARNING');
    expect(s.battery!.envelope!.max_discharge_kW).toBe(1500);
    expect(s.battery!.envelope!.max_discharge_kW!).toBeLessThan(NAMEPLATE.pcs_kW);
    expect(s.battery!.cell_temp_max_C!).toBeGreaterThan(40);
    expect(s.battery!.cell_temp_delta_C!).toBeGreaterThan(8);
    expect(s.alarms.map((a) => a.code).sort()).toEqual(['TEMP_DELTA', 'TEMP_HIGH']);
  });

  it('leaves every other skid at full nameplate envelope', () => {
    for (const id of ['SKID-1', 'SKID-3', 'SKID-4', 'SKID-6']) {
      expect(skid(id).battery!.envelope!.max_discharge_kW).toBe(NAMEPLATE.pcs_kW);
    }
  });
});

describe('isSkid', () => {
  it('distinguishes skids from the substation and load', () => {
    expect(isSkid(INITIAL_SNAPSHOT.assets['SKID-1'])).toBe(true);
    expect(isSkid(INITIAL_SNAPSHOT.assets.SUBSTATION)).toBe(false);
    expect(isSkid(INITIAL_SNAPSHOT.assets.LOAD)).toBe(false);
  });
});
