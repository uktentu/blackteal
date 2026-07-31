/**
 * Site diagram — SVG, not positioned divs: crisp at any size, and stroke/fill transitions
 * animate cheaply.
 *
 * Laid out from the topology data (checklist A1), using the topology's own coordinates. Note
 * those run left-to-right (substation x=80 -> skids x=300 -> load x=540) while the brief's
 * Figure 1 illustration runs right-to-left. The data wins: the brief says render from the
 * topology, and it explicitly says the art is not being evaluated.
 */

import { memo, useMemo } from 'react';
import { TOPOLOGY, NAMEPLATE } from '../domain/topology';
import type { Asset, AssetState, SiteState, SkidAsset, TopologyAsset } from '../domain/types';
import { fmt, fmtMW, NO_DATA, STATE_LABEL } from './format';
import './diagram.css';

const NODE_W = 164;
const NODE_H = 50;
const VIEW_W = 716;
const VIEW_H = 476;

/**
 * Diagram labels are shorter than the topology's full labels.
 *
 * A node carries its name AND its state text (color alone is never enough), and the full
 * "Grid / Substation (138 kV)" collides with the state at any node width that still fits six
 * skids on screen. The voltage lives in the detail drawer, where there is room for it.
 */
const SHORT_LABEL: Record<string, string> = {
  SUBSTATION: 'Substation',
  LOAD: 'Data Center',
  'SKID-1': 'Skid 1',
  'SKID-2': 'Skid 2',
  'SKID-3': 'Skid 3',
  'SKID-4': 'Skid 4',
  'SKID-5': 'Skid 5',
  'SKID-6': 'Skid 6',
};

/** Key metric per asset type — checklist A3, "live status plus a key metric". */
function keyMetric(asset: Asset): { value: string; unit: string } {
  if ('pcs' in asset) {
    const skid = asset as SkidAsset;
    if (skid.pcs?.power_kW == null) return { value: NO_DATA, unit: '' };
    return { value: fmtMW(skid.pcs.power_kW), unit: 'MW' };
  }
  return { value: fmt(asset.metrics.power_MW, 1), unit: 'MW' };
}

function secondaryMetric(asset: Asset): string | null {
  if ('pcs' in asset) {
    const soc = (asset as SkidAsset).battery?.soc_pct;
    return soc == null ? null : `${soc.toFixed(0)}% SoC`;
  }
  return null;
}

interface NodeProps {
  topo: TopologyAsset;
  asset: Asset;
  selected: boolean;
  stale: boolean;
  onSelect: (id: string) => void;
}

/**
 * One asset. Memoized so a tick that changes SKID-2 does not re-render the other seven
 * (checklist I-perf) — the comparator below is what makes that real.
 */
const AssetNode = memo(
  function AssetNode({ topo, asset, selected, stale, onSelect }: NodeProps) {
    const { value, unit } = keyMetric(asset);
    const secondary = secondaryMetric(asset);
    const state: AssetState = asset.state;
    const x = topo.x;
    const y = topo.y;

    return (
      <g
        className="node"
        data-state={state}
        data-selected={selected || undefined}
        data-stale={stale || undefined}
        transform={`translate(${x} ${y})`}
        onClick={() => onSelect(topo.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(topo.id);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`${topo.label}, ${STATE_LABEL[state]}, ${value} ${unit}`}
      >
        <rect className="node-body" width={NODE_W} height={NODE_H} rx={2} />

        {/* Status: 2px left rule + the mark. Never a filled card. */}
        <rect className="node-status-rule" width={2} height={NODE_H} />
        <g className="node-mark" transform={`translate(${15} ${15})`}>
          <circle className="node-mark-shape" r={4} />
        </g>

        <text className="node-label" x={28} y={19}>
          {SHORT_LABEL[topo.id] ?? topo.label}
        </text>

        {/* State label — the third channel, so meaning never rests on color alone. */}
        <text className="node-state" x={NODE_W - 10} y={19} textAnchor="end">
          {STATE_LABEL[state]}
        </text>

        <text className="node-metric metric" x={28} y={38}>
          {value}
          <tspan className="node-unit" dx={3}>
            {unit}
          </tspan>
          {secondary !== null && (
            <tspan className="node-secondary" dx={8}>
              {secondary}
            </tspan>
          )}
        </text>

        {/* Click-to-inspect affordance, echoing the brief's own Figure 1 "+" markers. */}
        <g className="node-plus" transform={`translate(${NODE_W - 15} ${NODE_H - 15})`}>
          <circle r={7} />
          <path d="M-3.5 0 H3.5 M0 -3.5 V3.5" />
        </g>
      </g>
    );
  },
  (a, b) =>
    a.asset === b.asset &&
    a.selected === b.selected &&
    a.stale === b.stale &&
    a.topo === b.topo,
);

interface LinkProps {
  from: TopologyAsset;
  to: TopologyAsset;
  /** MW on this connection; sign gives direction. */
  flowMW: number;
  live: boolean;
}

/**
 * A connection, with power-flow direction and magnitude (the brief's "also welcome" extra).
 *
 * Direction is carried by an animated dash offset — the one motion exception in the budget,
 * because direction genuinely cannot be expressed statically. Magnitude is stroke width.
 */
const Link = memo(function Link({ from, to, flowMW, live }: LinkProps) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  const d = `M${x1} ${y1} H${mid} V${y2} H${x2}`;

  const magnitude = Math.min(3, 0.6 + Math.abs(flowMW) * 0.7);
  const flowing = live && Math.abs(flowMW) > 0.05;

  return (
    <g className="link" data-flowing={flowing || undefined}>
      <path className="link-base" d={d} />
      {flowing && (
        <path
          className="link-flow"
          d={d}
          strokeWidth={magnitude}
          // Negative flow reverses the dash march, so the arrows read the right way.
          style={{ animationDirection: flowMW < 0 ? 'reverse' : 'normal' }}
        />
      )}
    </g>
  );
});

interface Props {
  site: SiteState;
  selectedId: string | null;
  stale: boolean;
  onSelect: (id: string) => void;
}

export function Diagram({ site, selectedId, stale, onSelect }: Props) {
  const byId = useMemo(
    () => Object.fromEntries(TOPOLOGY.assets.map((a) => [a.id, a])),
    [],
  );

  return (
    <svg
      className="diagram"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Site single-line diagram"
    >
      <g className="links">
        {TOPOLOGY.links.map((l) => {
          const skidId = l.from === 'SUBSTATION' ? l.to : l.from;
          const skid = site.assets[skidId] as SkidAsset | undefined;
          const kW = skid?.pcs?.power_kW ?? 0;

          // Substation->skid carries what the grid supplies past the skid; skid->load carries
          // the skid's discharge. Both are shown as positive magnitude toward the load.
          const flowMW = l.from === 'SUBSTATION' ? (NAMEPLATE.pcs_kW + kW) / 1000 : -kW / 1000;

          return (
            <Link
              key={`${l.from}->${l.to}`}
              from={byId[l.from]}
              to={byId[l.to]}
              flowMW={flowMW}
              live={!stale}
            />
          );
        })}
      </g>

      <g className="nodes">
        {TOPOLOGY.assets.map((topo) => (
          <AssetNode
            key={topo.id}
            topo={topo}
            asset={site.assets[topo.id]}
            selected={selectedId === topo.id}
            stale={stale}
            onSelect={onSelect}
          />
        ))}
      </g>
    </svg>
  );
}
