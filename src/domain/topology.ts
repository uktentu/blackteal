/** Site topology — transcribed verbatim from docs/BRIEF.md §2. */

import type { AssetType, Topology } from './types';

export const TOPOLOGY: Topology = {
  assets: [
    { id: 'SUBSTATION', type: 'substation', label: 'Grid / Substation (138 kV)', x: 80, y: 160 },
    { id: 'SKID-1', type: 'skid', label: 'Power Skid 1', x: 300, y: 40 },
    { id: 'SKID-2', type: 'skid', label: 'Power Skid 2', x: 300, y: 110 },
    { id: 'SKID-3', type: 'skid', label: 'Power Skid 3', x: 300, y: 180 },
    { id: 'SKID-4', type: 'skid', label: 'Power Skid 4', x: 300, y: 250 },
    { id: 'SKID-5', type: 'skid', label: 'Power Skid 5', x: 300, y: 320 },
    { id: 'SKID-6', type: 'skid', label: 'Power Skid 6', x: 300, y: 390 },
    { id: 'LOAD', type: 'load', label: 'Data Center Load', x: 540, y: 215 },
  ],
  links: [
    { from: 'SUBSTATION', to: 'SKID-1' },
    { from: 'SUBSTATION', to: 'SKID-2' },
    { from: 'SUBSTATION', to: 'SKID-3' },
    { from: 'SUBSTATION', to: 'SKID-4' },
    { from: 'SUBSTATION', to: 'SKID-5' },
    { from: 'SUBSTATION', to: 'SKID-6' },
    { from: 'SKID-1', to: 'LOAD' },
    { from: 'SKID-2', to: 'LOAD' },
    { from: 'SKID-3', to: 'LOAD' },
    { from: 'SKID-4', to: 'LOAD' },
    { from: 'SKID-5', to: 'LOAD' },
    { from: 'SKID-6', to: 'LOAD' },
  ],
};

export const SKID_IDS = TOPOLOGY.assets.filter((a) => a.type === 'skid').map((a) => a.id);

const KIND_BY_ID: Record<string, AssetType> = Object.fromEntries(
  TOPOLOGY.assets.map((a) => [a.id, a.type]),
);

/**
 * The asset's kind, from the topology.
 *
 * Needed because SubstationMetrics and LoadMetrics have entirely optional fields, which makes
 * them mutually assignable — so `'pue' in metrics` neither narrows at compile time nor is
 * safe to rely on at runtime. The topology already knows the answer; ask it.
 */
export function assetKind(id: string): AssetType | undefined {
  return KIND_BY_ID[id];
}

/** Nameplate ratings — docs/BRIEF.md §3. */
export const NAMEPLATE = {
  grid_kV: 138,
  grid_Hz: 60,
  mainTransformer_MVA: 50,
  mvBus_kV: 34.5,
  skidTransformer_MVA: 3,
  skidTransformer_lv_V: 690,
  /** Per-skid PCS rating. The reference point for "derated" in the operating envelope. */
  pcs_kW: 2500,
  battery_kWh: 10_000,
  battery_nominal_V: 1330,
  stringsPerContainer: 24,
  /** DC current rating — the DC_OVERCURRENT limit, which the catalog leaves as "rating". */
  battery_current_rating_A: 1900,
  bess_MW: 15,
  bess_MWh: 60,
  facilityLoad_MW: 38,
} as const;
