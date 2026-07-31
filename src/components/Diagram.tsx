/**
 * Site diagram — SVG, not positioned divs: crisp at any size, and stroke/fill transitions
 * animate cheaply.
 *
 * Laid out from the topology data (checklist A1). The data pack's coordinates are honored
 * exactly; a topology without coordinates (a real 60-skid site) goes through `ensureLayout`.
 * The view is zoomable/pannable, and detail follows viewing distance: zoomed below 0.8x the
 * nodes drop their metric line and keep mark + name + state, because text soup at zoom-out is
 * the classic SCADA failure.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ensureLayout, extents, NODE_W, NODE_H } from './layout';
import {
  zoomAt,
  pan,
  centerOn,
  contains,
  clientToDiagram,
  diagramToClient,
  zoomLevel,
  type ViewBox,
} from './viewbox';
import './diagram.css';

/** The data pack is fully placed, so this is the identity — but the scale path is real. */
const LAYOUT = ensureLayout(TOPOLOGY);
const BASE: ViewBox = extents(LAYOUT);

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
};

const shortLabel = (topo: TopologyAsset) =>
  SHORT_LABEL[topo.id] ?? topo.label.replace(/^Power\s+/, '');

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

    return (
      <g
        className="node"
        data-state={state}
        data-selected={selected || undefined}
        data-flashed={flashed || undefined}
        data-stale={stale || undefined}
        transform={`translate(${topo.x} ${topo.y})`}
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
          {shortLabel(topo)}
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
 * because direction genuinely cannot be expressed statically — plus a static arrowhead so it
 * survives prefers-reduced-motion. Magnitude is stroke width.
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

  // Arrowhead sits near the destination end of the horizontal run, pointing the way power
  // travels.
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
            style={{ animationDirection: flowMW < 0 ? 'reverse' : 'normal' }}
          />
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
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [vb, setVb] = useState<ViewBox>(BASE);
  const vbRef = useRef(vb);
  vbRef.current = vb;

  const [size, setSize] = useState({ cw: 0, ch: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const hoverTimer = useRef<number | null>(null);
  const drag = useRef<{ mx: number; my: number; vb: ViewBox; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const byId = useMemo(() => Object.fromEntries(LAYOUT.assets.map((a) => [a.id, a])), []);

  // Track the rendered size, so screen-space overlays can anchor to diagram coordinates.
  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ cw: r.width, ch: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Wheel zoom, attached natively: React registers root wheel listeners as passive, so a JSX
   * onWheel cannot preventDefault and the page would scroll while the operator zooms.
   */
  useEffect(() => {
    const el = svgRef.current;
    if (el === null) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cur = vbRef.current;
      const p = clientToDiagram(cur, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      setVb(zoomAt(cur, BASE, e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // An alarm-row jump must land in view: flash is useless on a node outside the frame.
  useEffect(() => {
    if (flashedId === null) return;
    const t = byId[flashedId];
    if (t === undefined) return;
    const cx = t.x + NODE_W / 2;
    const cy = t.y + NODE_H / 2;
    if (!contains(vbRef.current, cx, cy, 24)) {
      setVb((cur) => centerOn(cur, BASE, cx, cy));
    }
  }, [flashedId, byId]);

  useEffect(
    () => () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    },
    [],
  );

  /** Small show-delay so sweeping the pointer across six skids doesn't strobe tooltips. */
  const onHover = useCallback((id: string | null) => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (id === null) {
      setHoveredId(null);
      return;
    }
    hoverTimer.current = window.setTimeout(() => setHoveredId(id), 100);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      // A drag that ended on a node is a pan, not a click.
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      onSelect(id);
    },
    [onSelect],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { mx: e.clientX, my: e.clientY, vb, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d === null) return;
    const dx = e.clientX - d.mx;
    const dy = e.clientY - d.my;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setPanning(true);
      setHoveredId(null);
    }
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.min(r.width / d.vb.w, r.height / d.vb.h);
    setVb(pan(d.vb, BASE, -dx / scale, -dy / scale));
  };

  const onPointerUp = () => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
    setPanning(false);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Reset only from the background; a double-click on a node is two selects, not a reset.
    if ((e.target as Element).closest('.node') === null) setVb(BASE);
  };

  const zoom = zoomLevel(vb, BASE);
  const hoveredTopo = hoveredId !== null && hoveredId !== selectedId ? byId[hoveredId] : undefined;

  return (
    <div className="diagram-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="diagram"
        data-detail={zoom < 0.8 ? 'low' : 'high'}
        data-panning={panning || undefined}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Site single-line diagram"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <g className="links">
          {LAYOUT.links.map((l) => {
            const skidId = l.from === 'SUBSTATION' ? l.to : l.from;
            const skid = site.assets[skidId] as SkidAsset | undefined;
            const kW = skid?.pcs?.power_kW ?? 0;

            // Substation->skid carries what the grid supplies past the skid; skid->load
            // carries the skid's discharge. Both drawn as magnitude toward the load.
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
          {LAYOUT.assets.map((topo) => (
            <AssetNode
              key={topo.id}
              topo={topo}
              asset={site.assets[topo.id]}
              selected={selectedId === topo.id}
              flashed={flashedId === topo.id}
              stale={stale}
              onSelect={handleSelect}
              onHover={onHover}
            />
          ))}
        </g>
      </svg>

      {/* Zoom controls — quiet, hairline, keyboard-reachable. */}
      <div className="zoom-controls" role="group" aria-label="Diagram zoom">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setVb((v) => zoomAt(v, BASE, 1.25, v.x + v.w / 2, v.y + v.h / 2))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setVb((v) => zoomAt(v, BASE, 1 / 1.25, v.x + v.w / 2, v.y + v.h / 2))}
        >
          −
        </button>
        <button type="button" aria-label="Reset view" onClick={() => setVb(BASE)}>
          ⤢
        </button>
      </div>

      {/*
        Hover tooltip in SCREEN space, not SVG space. Inside the SVG it would scale with the
        zoom — unreadable zoomed out, enormous zoomed in. Anchored to the node through the
        current view transform instead.
      */}
      {hoveredTopo !== undefined &&
        size.cw > 0 &&
        (() => {
          const lines = tooltipLines(hoveredTopo, site.assets[hoveredTopo.id]);
          const p = diagramToClient(
            vb,
            size.cw,
            size.ch,
            hoveredTopo.x + NODE_W / 2,
            hoveredTopo.y + NODE_H,
          );
          const estH = 30 + lines.length * 17;
          const below = p.y + 10 + estH < size.ch;
          const left = Math.min(Math.max(p.x, 100), size.cw - 100);

          return (
            <div
              className="tip-overlay"
              style={{
                left,
                top: below ? p.y + 8 : p.y - NODE_H * p.scale - 8,
                transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
              }}
            >
              <div className="tip-title">{shortLabel(hoveredTopo)}</div>
              {lines.map((line) => (
                <div key={line} className="tip-line metric">
                  {line}
                </div>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
