/**
 * Stage 4 tests.
 *
 * The important property is that the sentence is DERIVED, not written: it must carry the
 * measured number and the actual envelope, so it cannot drift away from the telemetry the
 * panel is showing next to it.
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../domain/snapshot';
import type { SkidAsset } from '../domain/types';
import { explainAsset, explainSite } from './explain';

const skid = (id: string) => INITIAL_SNAPSHOT.assets[id] as SkidAsset;

describe('explainAsset', () => {
  it('says nothing about a healthy asset', () => {
    expect(explainAsset('Power Skid 1', skid('SKID-1'))).toBeNull();
  });

  it('explains a derate with its cause, measurement and cap', () => {
    const text = explainAsset('Skid 2', skid('SKID-2'))!;

    // Reads like the brief's own example sentence.
    expect(text).toContain('Skid 2 is derated');
    expect(text).toContain('hot'); // the cause, in plain language
    expect(text).toContain('41.2 °C'); // the measurement that triggered it
    expect(text).toContain('1.5 MW'); // the resulting cap
    expect(text).toContain('2.5 MW'); // against nameplate
  });

  it('explains an offline asset and warns that values are not live', () => {
    const text = explainAsset('Skid 5', skid('SKID-5'))!;
    expect(text).toContain('offline');
    expect(text).toContain('last known');
  });

  it('carries the live measurement, not a hardcoded number', () => {
    // Move the temperature; the sentence must move with it.
    const hotter: SkidAsset = {
      ...skid('SKID-2'),
      battery: { ...skid('SKID-2').battery!, cell_temp_max_C: 46.7 },
    };
    expect(explainAsset('Skid 2', hotter)).toContain('46.7 °C');
  });

  it('tracks the envelope rather than assuming 1.5 MW', () => {
    const harder: SkidAsset = {
      ...skid('SKID-2'),
      battery: {
        ...skid('SKID-2').battery!,
        envelope: { max_charge_kW: 2500, max_discharge_kW: 900 },
      },
    };
    expect(explainAsset('Skid 2', harder)).toContain('0.9 MW');
  });

  it('falls back to the worst alarm when there is no derate', () => {
    const faulted: SkidAsset = {
      ...skid('SKID-1'),
      state: 'FAULT',
      alarms: [{ code: 'INSULATION_CRIT', severity: 'critical', message: 'Insulation critical' }],
    };
    const text = explainAsset('Skid 1', faulted)!;
    expect(text).toContain('insulation resistance is critically low');
  });

  it('mentions how many other alarms are queued behind the headline one', () => {
    const many: SkidAsset = {
      ...skid('SKID-1'),
      state: 'FAULT',
      alarms: [
        { code: 'INSULATION_CRIT', severity: 'critical', message: 'a' },
        { code: 'TEMP_DELTA', severity: 'warning', message: 'b' },
        { code: 'SOC_LOW', severity: 'warning', message: 'c' },
      ],
    };
    expect(explainAsset('Skid 1', many)).toContain('+2 other alarms');
  });
});

describe('explainSite', () => {
  const labels = { 'SKID-2': 'Skid 2', 'SKID-5': 'Skid 5' };

  it('returns null for a fully healthy site', () => {
    const healthy = Object.fromEntries(
      Object.entries(INITIAL_SNAPSHOT.assets).map(([id, a]) => [
        id,
        { ...a, state: 'NORMAL' as const, alarms: [] },
      ]),
    );
    expect(explainSite(healthy, labels)).toBeNull();
  });

  it('leads with a fault over a warning', () => {
    const assets = {
      ...INITIAL_SNAPSHOT.assets,
      'SKID-2': { ...skid('SKID-2') },
      'SKID-5': {
        ...skid('SKID-5'),
        state: 'FAULT' as const,
        alarms: [{ code: 'CELL_OV' as const, severity: 'critical' as const, message: 'ov' }],
      },
    };
    expect(explainSite(assets, labels)).toContain('Skid 5');
  });
});
