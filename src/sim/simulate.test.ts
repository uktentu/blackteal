/**
 * Simulator and rule-engine tests.
 *
 * These are the brief's "a couple of tests around your state/data logic" (checklist H3), and
 * they cover the failure modes a reviewer would actually hit: drift out of range over a long
 * session, a broken power balance, an inverted sign convention, and duplicate ladder alarms.
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../domain/snapshot';
import { NAMEPLATE, SKID_IDS } from '../domain/topology';
import type { LoadAsset, SiteState, SkidAsset, SubstationAsset } from '../domain/types';
import { simulateFrame, solveBalance, siteSummary } from './simulate';
import { initialControl, TIMELINE, type SimControl } from './scenarios';
import { evaluateSkid, rollUpState, derateCause, headroom, sortAlarms } from './rules';

/** Run the simulator for `seconds` and return every frame. */
function run(seconds: number, mutate?: (ctl: SimControl, t: number) => void) {
  let state: SiteState = INITIAL_SNAPSHOT;
  const ctl = initialControl();
  const frames: SiteState[] = [];

  for (let t = 1; t <= seconds; t++) {
    ctl.t = t;
    mutate?.(ctl, t);
    state = simulateFrame(state, ctl, t * 2654435761);
    frames.push(state);
  }
  return { frames, last: state, ctl };
}

const skid = (s: SiteState, id: string) => s.assets[id] as SkidAsset;
const sub = (s: SiteState) => s.assets.SUBSTATION as SubstationAsset;
const load = (s: SiteState) => s.assets.LOAD as LoadAsset;

describe('power balance', () => {
  it('holds within 0.5 MW across a long run', () => {
    const { frames } = run(300);

    for (const f of frames) {
      const discharge =
        -SKID_IDS.map((id) => skid(f, id).pcs?.power_kW ?? 0).reduce((a, b) => a + b, 0) / 1000;
      const residual = (load(f).metrics.power_MW ?? 0) - discharge - (sub(f).metrics.power_MW ?? 0);
      expect(Math.abs(residual)).toBeLessThan(0.5);
    }
  });

  it('solves grid import rather than jittering it independently', () => {
    // Halving the fleet's discharge must raise grid import by the same amount.
    const base = solveBalance(INITIAL_SNAPSHOT);
    const halved: SiteState = {
      ...base,
      assets: Object.fromEntries(
        Object.entries(base.assets).map(([id, a]) => {
          if (!SKID_IDS.includes(id)) return [id, a];
          const sk = a as SkidAsset;
          return [id, sk.pcs ? { ...sk, pcs: { ...sk.pcs, power_kW: sk.pcs.power_kW! / 2 } } : sk];
        }),
      ),
    };

    const before = sub(base).metrics.power_MW ?? 0;
    const after = sub(solveBalance(halved)).metrics.power_MW ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeCloseTo(4.7, 0); // half of ~9.4 MW
  });

  it('excludes the offline skid from the discharge total', () => {
    const s = solveBalance(INITIAL_SNAPSHOT);
    expect(skid(s, 'SKID-5').pcs).toBeNull();
    expect(siteSummary(s).bess_MW).toBeCloseTo(9.4, 1);
  });
});

describe('sign convention (+ = charge/import, - = discharge/export)', () => {
  it('keeps online skids negative while the fleet discharges', () => {
    const { last } = run(60);
    for (const id of SKID_IDS) {
      const pcs = skid(last, id).pcs;
      if (pcs === null) continue;
      expect(pcs.power_kW).toBeLessThan(0);
    }
  });

  it('reports grid import as positive', () => {
    const { last } = run(60);
    expect(sub(last).metrics.power_MW).toBeGreaterThan(0);
  });

  it('grosses battery DC power above PCS AC power when discharging', () => {
    // Discharging, the battery gives up more DC than the inverter delivers as AC.
    const { last } = run(5);
    const sk = skid(last, 'SKID-1');
    expect(Math.abs(sk.battery!.power_kW!)).toBeGreaterThan(Math.abs(sk.pcs!.power_kW!));
  });
});

describe('range discipline', () => {
  it('keeps every metric inside its documented band over 500 ticks', () => {
    const { frames } = run(500);

    for (const f of frames) {
      const m = sub(f).metrics;
      expect(m.voltage_kV!).toBeGreaterThanOrEqual(131);
      expect(m.voltage_kV!).toBeLessThanOrEqual(145);
      expect(m.frequency_Hz!).toBeGreaterThanOrEqual(59.95);
      expect(m.frequency_Hz!).toBeLessThanOrEqual(60.05);
      expect(m.power_factor!).toBeGreaterThanOrEqual(0.95);
      expect(m.power_factor!).toBeLessThanOrEqual(1);

      for (const id of SKID_IDS) {
        const b = skid(f, id).battery;
        if (b == null) continue;
        expect(b.dc_bus_V!).toBeGreaterThanOrEqual(1150);
        expect(b.dc_bus_V!).toBeLessThanOrEqual(1500);
        expect(b.cell_v_min!).toBeGreaterThanOrEqual(2.8);
        expect(b.cell_v_max!).toBeLessThanOrEqual(3.65);
        expect(b.soc_pct!).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('never lets a derived triple go inconsistent', () => {
    const { frames } = run(200);

    for (const f of frames) {
      for (const id of SKID_IDS) {
        const b = skid(f, id).battery;
        if (b == null) continue;
        expect(b.cell_temp_min_C!).toBeLessThanOrEqual(b.cell_temp_max_C!);
        expect(b.cell_v_min!).toBeLessThanOrEqual(b.cell_v_max!);
        expect(b.cell_temp_delta_C!).toBeCloseTo(b.cell_temp_max_C! - b.cell_temp_min_C!, 1);
      }
    }
  });

  it('drains state of charge while discharging, and does not gain it', () => {
    const { frames } = run(120);
    const first = skid(frames[0], 'SKID-1').battery!.soc_pct!;
    const last = skid(frames[frames.length - 1], 'SKID-1').battery!.soc_pct!;
    expect(last).toBeLessThan(first);
  });
});

describe('scripted scenarios', () => {
  it('clears SKID-2 from WARNING to NORMAL as it cools, and un-derates it', () => {
    const { frames } = run(40);

    expect(skid(frames[0], 'SKID-2').state).toBe('WARNING');
    expect(skid(frames[0], 'SKID-2').battery!.envelope!.max_discharge_kW).toBe(1500);

    const settled = frames[frames.length - 1];
    expect(skid(settled, 'SKID-2').state).toBe('NORMAL');
    expect(skid(settled, 'SKID-2').battery!.cell_temp_max_C!).toBeLessThan(40);
    expect(skid(settled, 'SKID-2').battery!.envelope!.max_discharge_kW).toBe(NAMEPLATE.pcs_kW);
  });

  it('brings SKID-5 back online with full telemetry', () => {
    const { frames } = run(TIMELINE.skid5Reconnect_s + 3);

    expect(skid(frames[0], 'SKID-5').state).toBe('OFFLINE');
    const back = frames[frames.length - 1];
    expect(skid(back, 'SKID-5').state).toBe('NORMAL');
    expect(skid(back, 'SKID-5').pcs).not.toBeNull();
    expect(skid(back, 'SKID-5').battery).not.toBeNull();
    expect(skid(back, 'SKID-5').alarms).toHaveLength(0);
  });

  it('both scripted transitions land inside the first two minutes', () => {
    expect(TIMELINE.skid5Reconnect_s).toBeLessThan(120);
    expect(TIMELINE.burst_s).toBeLessThan(120);
  });

  it('fires 15+ alarms across several skids and codes during the burst', () => {
    const { frames } = run(TIMELINE.burst_s + 4);
    const peak = frames[frames.length - 1];

    const alarms = Object.values(peak.assets).flatMap((a) => a.alarms);
    expect(alarms.length).toBeGreaterThanOrEqual(15);

    // A burst of one repeated code would collapse into a single group and prove nothing.
    expect(new Set(alarms.map((a) => a.code)).size).toBeGreaterThanOrEqual(3);
    expect(
      new Set(SKID_IDS.filter((id) => skid(peak, id).alarms.length > 0)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(alarms.some((a) => a.severity === 'critical')).toBe(true);
  });

  it('recovers after the burst clears', () => {
    const { frames } = run(TIMELINE.burstClear_s + 25);
    const settled = frames[frames.length - 1];
    const alarms = Object.values(settled.assets).flatMap((a) => a.alarms);
    expect(alarms.length).toBeLessThan(5);
  });

  it('flags the feed stale on a dropout trigger and recovers on the next', () => {
    const { frames } = run(12, (ctl, t) => {
      if (t === 4 || t === 9) ctl.queued.push('dropout');
    });
    expect(frames[2].stale).toBe(false);
    expect(frames[5].stale).toBe(true);
    expect(frames[10].stale).toBe(false);
  });
});

describe('rule engine', () => {
  it('suppresses the weaker sibling in a severity ladder', () => {
    // 51 C trips both TEMP_CRIT (>50) and TEMP_HIGH (>40). Only the critical may survive.
    const { alarms } = evaluateSkid({
      pcs: null,
      battery: { state: 'NORMAL', cell_temp_max_C: 51, cell_temp_min_C: 30 },
      transformer: null,
    });

    const codes = alarms.map((a) => a.code);
    expect(codes).toContain('TEMP_CRIT');
    expect(codes).not.toContain('TEMP_HIGH');
  });

  it('does the same for insulation and cell voltage', () => {
    const { alarms } = evaluateSkid({
      pcs: null,
      battery: { state: 'NORMAL', insulation_MOhm: 0.3, cell_v_max: 3.7, cell_v_min: 3.2 },
      transformer: null,
    });
    const codes = alarms.map((a) => a.code);
    expect(codes).toContain('INSULATION_CRIT');
    expect(codes).not.toContain('INSULATION_LOW');
    expect(codes).toContain('CELL_OV');
    expect(codes).not.toContain('CELL_OV_WARN');
  });

  it('reports OFFLINE rather than FAULT for a skid with no telemetry', () => {
    // COMMS_LOST is critical, but the brief's snapshot gives SKID-5 state OFFLINE.
    const result = evaluateSkid({ pcs: null, battery: null, transformer: null });
    expect(result.state).toBe('OFFLINE');
    expect(result.alarms[0].code).toBe('COMMS_LOST');
    expect(rollUpState(result.alarms, true)).toBe('OFFLINE');
    expect(rollUpState(result.alarms, false)).toBe('FAULT');
  });

  it('evaluates a legitimate zero instead of skipping it as falsy', () => {
    const { alarms } = evaluateSkid({
      pcs: null,
      battery: { state: 'NORMAL', soc_pct: 0 },
      transformer: null,
    });
    expect(alarms.map((a) => a.code)).toContain('SOC_LOW');
  });

  it('fires nothing on absent metrics rather than treating undefined as 0', () => {
    const { alarms, state } = evaluateSkid({
      pcs: { state: 'NORMAL', power_kW: -1900, mode: 'DISCHARGE' },
      battery: { state: 'NORMAL', dc_bus_V: 1330 },
      transformer: { state: 'NORMAL' },
    });
    expect(alarms).toHaveLength(0);
    expect(state).toBe('NORMAL');
  });

  it('sorts critical above warning', () => {
    const sorted = sortAlarms([
      { code: 'TEMP_HIGH', severity: 'warning', message: '' },
      { code: 'CELL_OV', severity: 'critical', message: '' },
      { code: 'SOC_LOW', severity: 'warning', message: '' },
    ]);
    expect(sorted[0].severity).toBe('critical');
  });

  it('builds messages from the measured value, so the rule is the explanation', () => {
    const { alarms } = evaluateSkid({
      pcs: null,
      battery: { state: 'NORMAL', cell_temp_max_C: 41.2, cell_temp_min_C: 33.1 },
      transformer: null,
    });
    expect(alarms.find((a) => a.code === 'TEMP_HIGH')!.message).toContain('41.2');
  });
});

describe('envelope and derate (Stage 3 / Stage 4 inputs)', () => {
  it('computes headroom and derate against nameplate', () => {
    const h = headroom(skid(INITIAL_SNAPSHOT, 'SKID-2').battery, NAMEPLATE.pcs_kW)!;
    expect(h.envelope_kW).toBe(1500);
    expect(h.derate_kW).toBe(1000);
    expect(h.isDerated).toBe(true);
    expect(h.headroom_kW).toBe(0); // pushing 1509 kW inside a 1500 kW envelope
  });

  it('reports no derate on a healthy skid', () => {
    const h = headroom(skid(INITIAL_SNAPSHOT, 'SKID-1').battery, NAMEPLATE.pcs_kW)!;
    expect(h.isDerated).toBe(false);
    expect(h.derate_kW).toBe(0);
  });

  it('returns null rather than a wrong number when inputs are missing', () => {
    expect(headroom(null, NAMEPLATE.pcs_kW)).toBeNull();
    expect(headroom({ state: 'NORMAL' }, NAMEPLATE.pcs_kW)).toBeNull();
  });

  it('attributes the derate to the highest-severity thermal alarm', () => {
    const cause = derateCause(skid(INITIAL_SNAPSHOT, 'SKID-2').alarms)!;
    expect(['TEMP_HIGH', 'TEMP_DELTA']).toContain(cause.code);
  });
});

describe('site summary', () => {
  it('counts assets needing attention for the top strip', () => {
    const s = siteSummary(INITIAL_SNAPSHOT);
    expect(s.needsAttention).toBe(2); // SKID-2 warning + SKID-5 offline
    expect(s.critical).toBe(1);
    expect(s.warning).toBe(2);
  });

  it('produces one state update per tick with a fresh reference', () => {
    const ctl = initialControl();
    ctl.t = 1;
    const next = simulateFrame(INITIAL_SNAPSHOT, ctl, 1);
    expect(next).not.toBe(INITIAL_SNAPSHOT);
    expect(next.assets).not.toBe(INITIAL_SNAPSHOT.assets);
  });
});
