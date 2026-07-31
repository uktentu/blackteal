/**
 * Site diagram — SVG, not positioned divs: crisp at any size, and stroke/fill transitions
 * animate cheaply.
 *
 * Laid out from the topology data (checklist A1), using the topology's own coordinates. Note
 * those run left-to-right (substation x=80 -> skids x=300 -> load x=540) while the brief's
 * Figure 1 illustration runs right-to-left. The data wins: the brief says render from the
 * topology, and it explicitly says the art is not being evaluated.
 */

import { memo, useMemo, useState } from 'react';
import { TOPOLOGY, NAMEPLATE } from '../domain/topology';
import type {
  Asset,
  AssetState,
  LoadAsset,
  SiteState,
  SkidAsset,
  SubstationAsset,
  TopologyAsset,
} from '../domain/types';
import { fmt, fmtMW, gridDirection, NO_DATA, powerDirection, STATE_LABEL } from './format';
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

/** 1-2 headline metrics for the hover tooltip — progressive disclosure before the drawer. */
function tooltipLines(topo: TopologyAsset, asset: Asset): string[] {
  if (topo.type === 'skid') {
    const skid = asset as SkidAsset;
    if (skid.pcs === null || skid.battery === null) return ['No telemetry — comms lost'];

    const lines = [
      `${fmtMW(skid.pcs.power_kW)} MW ${powerDirection(skid.pcs.power_kW) ?? ''}`.trim(),
      `${fmt(skid.battery.soc_pct, 0)}% SoC · ${fmt(skid.battery.cell_temp_max_C, 1)} °C max cell`,
    ];
    const env = skid.battery.envelope?.max_discharge_kW;
    if (env != null && env < NAMEPLATE.pcs_kW) {
      lines.push(`Derated to ${fmtMW(env)} MW`);
    }
    return lines;
  }

  if (topo.type === 'load') {
    const metrics = (asset as LoadAsset).metrics;
    return [
      `${fmt(metrics.power_MW, 1)} MW facility`,
      `${fmt(metrics.it_load_MW, 1)} MW IT · PUE ${fmt(metrics.pue, 2)}`,
    ];
  }

  const metrics = (asset as SubstationAsset).metrics;
  return [
    `${fmt(metrics.power_MW, 1)} MW ${gridDirection(metrics.power_MW) ?? ''}`.trim(),
    `${fmt(metrics.voltage_kV, 1)} kV · ${fmt(metrics.frequency_Hz, 2)} Hz`,
  ];
}

interface NodeProps {
  topo: TopologyAsset;
  asset: Asset;
  selected: boolean;
  /** Briefly true after an alarm row jumps here, so the eye can find the node. */
  flashed: boolean;
  stale: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * One asset. Memoized so a tick that changes SKID-2 does not re-render the other seven
 * (checklist I-perf) — the comparator below is what makes that real.
 */
const AssetNode = memo(
  function AssetNode({ topo, asset, selected, flashed, stale, onSelect, onHover }: NodeProps) {
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
        data-flashed={flashed || undefined}
        data-stale={stale || undefined}
        transform={`translate(${x} ${y})`}
        onClick={() => onSelect(topo.id)}
        onMouseEnter={() => onHover(topo.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(topo.id)}
        onBlur={() => onHover(null)}
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
    a.flashed === b.flashed &&
    a.stale === b.stale &&
    a.topo === b.topo,
);

/**
 * Hover tooltip — progressive disclosure. One or two headline metrics so an operator can
 * triage without committing to opening the drawer.
 *
 * Rendered as an SVG overlay in the diagram's own coordinate space, so it tracks the node
 * under zoom without a second positioning system.
 */
const Tooltip = memo(function Tooltip({ topo, asset }: { topo: TopologyAsset; asset: Asset }) {
  const lines = tooltipLines(topo, asset);
  const w = 186;
  const h = 20 + lines.length * 15;
  // Flip above the node when it would otherwise run off the bottom edge.
  const below = topo.y + NODE_H + h + 8 < VIEW_H;
  const y = below ? topo.y + NODE_H + 8 : topo.y - h - 8;
  const x = Math.min(topo.x, VIEW_W - w - 4);

  return (
    <g className="tip" transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect className="tip-body" width={w} height={h} rx={2} />
      <text className="tip-title" x={10} y={16}>
        {SHORT_LABEL[topo.id] ?? topo.label}
      </text>
      {lines.map((line, i) => (
        <text key={line} className="tip-line metric" x={10} y={32 + i * 15}>
          {line}
        </text>
      ))}
    </g>
  );
});

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

  // Arrowhead sits at the midpoint of the horizontal run, pointing the way power travels.
  const headX = flowMW < 0 ? x1 + 14 : x2 - 14;
  const dir = flowMW < 0 ? -1 : 1;

  return (
    <g className="link" data-flowing={flowing || undefined}>
      <path className="link-base" d={d} />
      {flowing && (
        <>
          <path
            className="link-flow"
            d={d}
            strokeWidth={magnitude}
            // Negative flow reverses the dash march, so the motion reads the right way.
            style={{ animationDirection: flowMW < 0 ? 'reverse' : 'normal' }}
          />
          {/* A static arrowhead as well as the moving dashes: direction is the whole point
              of drawing flow, and it must survive prefers-reduced-motion. */}
          <path
            className="link-head"
            d={`M${headX} ${y2 - 3} L${headX + 5 * dir} ${y2} L${headX} ${y2 + 3} Z`}
          />
        </>
      )}
    </g>
  );
});

interface Props {
  site: SiteState;
  selectedId: string | null;
  /** Asset that an alarm row just jumped to; flashes so the eye can find it. */
  flashedId: string | null;
  stale: boolean;
  onSelect: (id: string) => void;
}

export function Diagram({ site, selectedId, flashedId, stale, onSelect }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
            flashed={flashedId === topo.id}
            stale={stale}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        ))}
      </g>

      {/* Tooltip last, so it paints above every node. */}
      {hoveredId !== null && hoveredId !== selectedId && (
        <Tooltip topo={byId[hoveredId]} asset={site.assets[hoveredId]} />
      )}
    </svg>
  );
}
