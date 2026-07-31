/**
 * Stage 4 — plain-language explanation of an abnormal asset.
 *
 * "Skid 2 derated: a module is at 41 °C, so discharge is capped to 1.5 MW."
 *
 * This is nearly free because the rule engine is data-driven: the rule that fired already
 * knows the measured value and the catalog knows its meaning. There is no second table of
 * explanation strings to keep in sync with the thresholds — a hand-written explanation would
 * drift the moment a threshold changed.
 *
 * Pure, rule-based, no AI. Reads to an operator as a sentence, not a log line.
 */

import { NAMEPLATE } from '../domain/topology';
import type { Alarm, Asset, SkidAsset } from '../domain/types';
import { derateCause, headroom } from './rules';

/** Short human phrase per alarm code, phrased as a cause rather than a status. */
const CAUSE: Partial<Record<Alarm['code'], string>> = {
  TEMP_CRIT: 'a module is over temperature',
  TEMP_HIGH: 'a module is running hot',
  TEMP_DELTA: 'cell temperatures have drifted apart',
  CELL_OV: 'a cell is overvoltage',
  CELL_OV_WARN: 'a cell is approaching overvoltage',
  CELL_UV: 'a cell is undervoltage',
  CELL_UV_WARN: 'a cell is approaching undervoltage',
  INSULATION_CRIT: 'insulation resistance is critically low',
  INSULATION_LOW: 'insulation resistance is falling',
  DC_OVERCURRENT: 'DC current is above rating',
  SOC_LOW: 'state of charge is low',
  SOH_DEGRADED: 'the pack is nearing end of life',
  HVAC_FAULT: 'cooling is degraded',
  GRID_FREQ: 'grid frequency is outside limits',
  COMMS_LOST: 'the skid stopped reporting',
};

const MW = (kW: number) => (kW / 1000).toFixed(1);

/**
 * One sentence for an abnormal asset, or null when it is healthy.
 *
 * Prefers the derate story when there is one, because "why can't this skid deliver full
 * power" is the question an operator is actually asking.
 */
export function explainAsset(label: string, asset: Asset): string | null {
  if (asset.state === 'NORMAL') return null;

  if (asset.state === 'OFFLINE') {
    return `${label} is offline: ${CAUSE.COMMS_LOST}, so no telemetry is available. Values shown are last known, not live.`;
  }

  const alarms = asset.alarms;
  if (alarms.length === 0) return null;

  // --- skid with a derated envelope: the highest-value explanation ---
  if ('pcs' in asset) {
    const skid = asset as SkidAsset;
    const h = headroom(skid.battery, NAMEPLATE.pcs_kW);
    const cause = derateCause(alarms);

    if (h !== null && h.isDerated && cause !== null) {
      const why = CAUSE[cause.code] ?? cause.message.toLowerCase();
      const detail = measuredDetail(cause, skid);
      return (
        `${label} is derated: ${why}${detail}, so discharge is capped to ${MW(h.envelope_kW)} MW ` +
        `instead of ${MW(NAMEPLATE.pcs_kW)} MW.`
      );
    }
  }

  // --- otherwise lead with the worst active alarm ---
  const worst = alarms[0];
  const why = CAUSE[worst.code] ?? worst.message.toLowerCase();
  const others = alarms.length - 1;
  const tail = others > 0 ? ` (+${others} other alarm${others === 1 ? '' : 's'})` : '';

  return `${label}: ${why}${tail}. ${worst.message}.`;
}

/** Pull the measured number back out of the telemetry so the sentence carries evidence. */
function measuredDetail(cause: Alarm, skid: SkidAsset): string {
  const b = skid.battery;
  if (b == null) return '';

  switch (cause.code) {
    case 'TEMP_CRIT':
    case 'TEMP_HIGH':
      return b.cell_temp_max_C == null ? '' : ` at ${b.cell_temp_max_C.toFixed(1)} °C`;
    case 'TEMP_DELTA':
      return b.cell_temp_delta_C == null ? '' : ` by ${b.cell_temp_delta_C.toFixed(1)} °C`;
    case 'INSULATION_CRIT':
    case 'INSULATION_LOW':
      return b.insulation_MOhm == null ? '' : ` at ${b.insulation_MOhm.toFixed(2)} MΩ`;
    default:
      return '';
  }
}

/** Site-level headline for the top strip when something is wrong. */
export function explainSite(assets: Record<string, Asset>, labels: Record<string, string>): string | null {
  const abnormal = Object.entries(assets).filter(([, a]) => a.state !== 'NORMAL');
  if (abnormal.length === 0) return null;

  const faults = abnormal.filter(([, a]) => a.state === 'FAULT');
  if (faults.length > 0) {
    const [id] = faults[0];
    return explainAsset(labels[id] ?? id, assets[id]);
  }

  const [id] = abnormal[0];
  return explainAsset(labels[id] ?? id, assets[id]);
}
