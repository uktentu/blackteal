/**
 * Isometric site view — the second of the app's two surfaces.
 *
 * The single-line diagram answers "how is the plant connected"; this answers "what does the
 * site look like right now". It mirrors the brief's Figure 1: a ground slab, the data-centre
 * hall, six containerised skids in two rows, the substation transformer and the transmission
 * pylon, with an orange "+" on everything an operator can inspect.
 *
 * Rendered as plain SVG rather than WebGL. At this object count a 3D engine would add a
 * dependency, a canvas that no screen reader can enter, and a second rendering model to keep
 * in sync — for a scene that never rotates. Every asset stays a real, focusable DOM element
 * carrying the same accessible name as its counterpart in the diagram view.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { NAMEPLATE, TOPOLOGY } from '../domain/topology';
import type { Asset, AssetState, LoadAsset, SiteState, SkidAsset, SubstationAsset } from '../domain/types';
import { fmt, fmtMW, STATE_LABEL } from './format';
import {
  boxCorners,
  boxFaces,
  groundShadow,
  project,
  polygon,
  quad,
  screenBounds,
  topCentre,
  type Box,
} from './iso/iso';
import { diagramToClient } from './layout';
import {
  FEEDER_Y,
  GROUND,
  LOAD_ANNEX,
  LOAD_BOX,
  LOAD_PLANT,
  PYLON,
  SKID_BOXES,
  SUB_BOX,
  SUB_BUSHINGS,
  SUB_PAD,
  SUB_RADS,
} from './iso/layout';
import './iso.css';

/** Every asset's clickable volume, so hit-testing and labels share one source. */
const ASSET_BOX: Record<string, Box> = {
  ...SKID_BOXES,
  LOAD: LOAD_BOX,
  SUBSTATION: SUB_BOX,
};

const LABELS: Record<string, { title: string; sub: string }> = {
  LOAD: { title: 'Data Center', sub: '~38 MW' },
  SUBSTATION: { title: 'Substation', sub: '138 / 34.5 kV' },
};

/**
 * Scene extents, then the viewBox built around them with explicit gutters.
 *
 * The gutters are where the leader-line labels live, exactly as they do in the source figure.
 * Fitting the viewBox to geometry alone pushed the "Data Center" annotation outside the SVG
 * and it was clipped by the viewport.
 */
const SCENE = screenBounds([
  ...boxCorners(GROUND),
  ...boxCorners(LOAD_BOX),
  ...Object.values(SKID_BOXES).flatMap(boxCorners),
  ...boxCorners(SUB_PAD),
  project(PYLON.x, PYLON.height, PYLON.z),
]);

/** Label gutters: generous left and right, a band on top for the skid group label. */
const GUTTER = { left: 138, right: 138, top: 42, bottom: 14 };

const VIEW = {
  x: SCENE.minX - GUTTER.left,
  y: SCENE.minY - GUTTER.top,
  w: SCENE.maxX - SCENE.minX + GUTTER.left + GUTTER.right,
  h: SCENE.maxY - SCENE.minY + GUTTER.top + GUTTER.bottom,
};

/**
 * Where the skid-group label points.
 *
 * The roof of the back-row middle container, not the block's centroid: the centroid projects
 * to a point *inside* the cluster, hidden behind the front row, so the leader appeared to end
 * in empty air just above the site.
 */
const SKID_LABEL_ANCHOR = topCentre(SKID_BOXES['SKID-2']);
const SKID_LABEL_X = SKID_LABEL_ANCHOR.x;

/** A solid, shaded box. Three faces only — the other three never face this camera. */
function Solid({ box, cls, shadow = true }: { box: Box; cls: string; shadow?: boolean }) {
  const f = boxFaces(box);
  return (
    <g className={cls}>
      {shadow && <polygon className="iso-shadow" points={groundShadow(box)} />}
      <polygon className="iso-face iso-left" points={f.left} />
      <polygon className="iso-face iso-right" points={f.right} />
      <polygon className="iso-face iso-top" points={f.top} />
    </g>
  );
}

/** Site grid on the slab — surveyor's lines, faint enough to read as texture. */
function GroundGrid() {
  const step = 26;
  const lines: string[] = [];
  for (let x = GROUND.x; x <= GROUND.x + GROUND.w + 0.1; x += step) {
    const a = project(x, 0.02, GROUND.z);
    const b = project(x, 0.02, GROUND.z + GROUND.d);
    lines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  for (let z = GROUND.z; z <= GROUND.z + GROUND.d + 0.1; z += step) {
    const a = project(GROUND.x, 0.02, z);
    const b = project(GROUND.x + GROUND.w, 0.02, z);
    lines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  return (
    <g className="iso-grid" aria-hidden="true">
      {lines.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

interface AssetProps {
  id: string;
  box: Box;
  asset: Asset;
  selected: boolean;
  flashed: boolean;
  stale: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * One inspectable asset. Memoized on the same terms as the diagram's node, so a tick that
 * changes one skid leaves the rest of the scene untouched.
 */
const IsoAsset = memo(
  function IsoAsset({ id, box, asset, selected, flashed, stale, onSelect, onHover }: AssetProps) {
    const state: AssetState = asset.state;
    const f = boxFaces(box);
    const c = topCentre(box);
    const label = TOPOLOGY.assets.find((a) => a.id === id)?.label ?? id;

    // The status strip runs along the roof edge, exactly as the figure draws it.
    const strip = quad(box.x, box.y + box.h + 0.05, box.z, box.w, 3.6);

    return (
      <g
        className="iso-asset"
        data-state={state}
        data-selected={selected || undefined}
        data-flashed={flashed || undefined}
        data-stale={stale || undefined}
        onClick={() => onSelect(id)}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(id)}
        onBlur={() => onHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(id);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`${label}, ${STATE_LABEL[state]}`}
      >
        <polygon className="iso-shadow" points={groundShadow(box)} />
        <polygon className="iso-face iso-left" points={f.left} />
        <polygon className="iso-face iso-right" points={f.right} />
        <polygon className="iso-face iso-top" points={f.top} />
        <polygon className="iso-strip" points={strip} />

        {/* Click-to-inspect marker, in BlackTeal's own orange, as in Figure 1. */}
        <g className="iso-plus" transform={`translate(${c.x.toFixed(2)} ${(c.y - 6).toFixed(2)})`}>
          <circle className="iso-plus-bg" r={7} />
          <path className="iso-plus-mark" d="M-3.2 0 H3.2 M0 -3.2 V3.2" />
        </g>
      </g>
    );
  },
  (a, b) =>
    a.asset === b.asset &&
    a.selected === b.selected &&
    a.flashed === b.flashed &&
    a.stale === b.stale,
);

/** Lattice transmission tower, drawn as a wireframe like the figure's. */
function Pylon() {
  const { x, z, baseHalf: bh, height, arms } = PYLON;
  const apexHalf = 4;

  const legs = [
    [-bh, -bh],
    [bh, -bh],
    [bh, bh],
    [-bh, bh],
  ].map(([dx, dz]) => {
    const foot = project(x + dx, 0, z + dz);
    const top = project(x + dx * (apexHalf / bh), height, z + dz * (apexHalf / bh));
    return `M${foot.x.toFixed(2)} ${foot.y.toFixed(2)} L${top.x.toFixed(2)} ${top.y.toFixed(2)}`;
  });

  // Horizontal bracing rings up the tower.
  const rings = [0.22, 0.45, 0.68, 0.88].map((t) => {
    const y = height * t;
    const s = bh * (1 - t) + apexHalf * t;
    return polygon([
      project(x - s, y, z - s),
      project(x + s, y, z - s),
      project(x + s, y, z + s),
      project(x - s, y, z + s),
    ]);
  });

  return (
    <g className="iso-pylon" aria-hidden="true">
      {rings.map((r) => (
        <polygon key={r} className="iso-pylon-ring" points={r} />
      ))}
      {legs.map((d) => (
        <path key={d} className="iso-pylon-leg" d={d} />
      ))}
      {arms.map((a) => {
        const l = project(x - a.half, a.y, z);
        const r = project(x + a.half, a.y, z);
        return <path key={a.y} className="iso-pylon-arm" d={`M${l.x} ${l.y} L${r.x} ${r.y}`} />;
      })}
    </g>
  );
}

interface Props {
  site: SiteState;
  selectedId: string | null;
  flashedId: string | null;
  stale: boolean;
  onSelect: (id: string) => void;
}

export function IsoScene({ site, selectedId, flashedId, stale, onSelect }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ cw: 0, ch: 0 });

  // The SVG letterboxes inside the panel, so the hover card cannot be placed by view-box
  // percentage — it has to go through the same fit transform the renderer uses, or it drifts
  // sideways and falls out of the viewport at the edges.
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
   * Painter's order. Assets are sorted back-to-front by x + z so nearer buildings overlap
   * further ones correctly; the data centre is drawn separately because it sits behind
   * everything on the far left.
   */
  const ordered = useMemo(
    () =>
      Object.entries(ASSET_BOX)
        .map(([id, box]) => ({ id, box }))
        .sort((a, b) => a.box.x + a.box.z - (b.box.x + b.box.z)),
    [],
  );

  // Feeder runs on the ground, from the substation pad across to the data-centre hall.
  const feeders = useMemo(
    () =>
      Object.entries(SKID_BOXES).map(([id, b]) => {
        const from = project(SUB_PAD.x, FEEDER_Y, b.z + b.d / 2);
        const to = project(b.x + b.w, FEEDER_Y, b.z + b.d / 2);
        const out = project(b.x, FEEDER_Y, b.z + b.d / 2);
        const load = project(LOAD_BOX.x + LOAD_BOX.w, FEEDER_Y, b.z + b.d / 2);
        return { id, feed: `M${from.x} ${from.y} L${to.x} ${to.y}`, tap: `M${out.x} ${out.y} L${load.x} ${load.y}` };
      }),
    [],
  );

  const hovered = hoveredId !== null && hoveredId !== selectedId ? hoveredId : null;

  return (
    <div className="iso-wrap" ref={wrapRef}>
      <svg
        className="iso"
        viewBox={`${VIEW.x.toFixed(1)} ${VIEW.y.toFixed(1)} ${VIEW.w.toFixed(1)} ${VIEW.h.toFixed(1)}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Isometric site view"
        data-stale={stale || undefined}
      >
        {/* ground */}
        <g className="iso-ground">
          <polygon className="iso-ground-side" points={boxFaces(GROUND).right} />
          <polygon className="iso-ground-side" points={boxFaces(GROUND).left} />
          <polygon className="iso-ground-top" points={boxFaces(GROUND).top} />
        </g>
        <GroundGrid />

        {/* feeder runs, under everything */}
        <g className="iso-feeders" aria-hidden="true">
          {feeders.map((f) => (
            <g key={f.id}>
              <path className="iso-feeder" d={f.feed} />
              <path className="iso-feeder" d={f.tap} />
            </g>
          ))}
        </g>

        <Pylon />

        {/* substation structure that isn't itself the clickable asset */}
        <Solid box={SUB_PAD} cls="iso-pad" />
        {SUB_RADS.map((b) => (
          <Solid key={`${b.x}`} box={b} cls="iso-kit" />
        ))}

        {/* data-centre outbuildings */}
        <Solid box={LOAD_ANNEX} cls="iso-kit" />
        {LOAD_PLANT.map((b) => (
          <Solid key={`${b.x}-${b.z}`} box={b} cls="iso-kit" />
        ))}

        {/* the inspectable assets, back to front */}
        {ordered.map(({ id, box }) => (
          <IsoAsset
            key={id}
            id={id}
            box={box}
            asset={site.assets[id]}
            selected={selectedId === id}
            flashed={flashedId === id}
            stale={stale}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        ))}

        {/* bushings sit on top of the transformer, so they paint after it */}
        {SUB_BUSHINGS.map((b) => (
          <Solid key={`${b.x}`} box={b} cls="iso-kit" />
        ))}

        {/*
          Leader-line labels, anchored in the gutters so they can never overlap the model.
          Each runs horizontally out to the gutter, then to the asset — the elbow keeps the
          leader from cutting diagonally across the site.
        */}
        {Object.entries(LABELS).map(([id, l]) => {
          const c = topCentre(ASSET_BOX[id]);
          const left = id === 'LOAD';
          const anchorX = left ? SCENE.minX - 14 : SCENE.maxX + 14;
          // Clamped into the gutter: deriving the height purely from the asset pushed the
          // data-centre annotation above the viewBox, where the viewport clipped it.
          const anchorY = Math.max(VIEW.y + 30, c.y - (left ? 58 : 32));
          const elbowX = left ? anchorX + 34 : anchorX - 34;

          return (
            <g key={id} className="iso-label" aria-hidden="true">
              <path
                className="iso-leader"
                d={`M${anchorX.toFixed(1)} ${anchorY.toFixed(1)} H${elbowX.toFixed(1)} L${c.x.toFixed(1)} ${(c.y - 15).toFixed(1)}`}
              />
              <circle className="iso-leader-dot" cx={c.x} cy={c.y - 15} r={2.4} />
              <text
                className="iso-label-title"
                x={anchorX}
                y={anchorY - 5}
                textAnchor={left ? 'end' : 'start'}
              >
                {l.title}
              </text>
              <text
                className="iso-label-sub"
                x={anchorX}
                y={anchorY + 9}
                textAnchor={left ? 'end' : 'start'}
              >
                {l.sub}
              </text>
            </g>
          );
        })}

        {/* Skid group label, centred over the two rows in the top gutter. */}
        <g className="iso-label" aria-hidden="true">
          <text className="iso-label-title" x={SKID_LABEL_X} y={VIEW.y + 22} textAnchor="middle">
            BESS Skids
          </text>
          <text className="iso-label-sub" x={SKID_LABEL_X} y={VIEW.y + 36} textAnchor="middle">
            6 × 2.5 MW / 10 MWh
          </text>
          <path
            className="iso-leader"
            d={`M${SKID_LABEL_X} ${VIEW.y + 44} V${(SKID_LABEL_ANCHOR.y - 16).toFixed(1)}`}
          />
          <circle className="iso-leader-dot" cx={SKID_LABEL_X} cy={SKID_LABEL_ANCHOR.y - 16} r={2.4} />
        </g>
      </svg>

      {hovered !== null && size.cw > 0 && (
        <IsoTooltip id={hovered} asset={site.assets[hovered]} cw={size.cw} ch={size.ch} />
      )}
    </div>
  );
}

/**
 * Hover card, anchored to the asset with a pointing caret.
 *
 * Positioned in screen space as a percentage of the fitted viewBox, so it tracks the SVG's
 * scaling without needing to measure the DOM. Near the left and right edges it flips its
 * anchoring so it can never be clipped by the viewport — with the caret moving to match, so
 * it still points at the box it describes.
 */
function IsoTooltip({
  id,
  asset,
  cw,
  ch,
}: {
  id: string;
  asset: Asset;
  cw: number;
  ch: number;
}) {
  const label = TOPOLOGY.assets.find((a) => a.id === id)?.label ?? id;
  const box = ASSET_BOX[id];
  const c = topCentre(box);

  // Same transform the SVG applies under preserveAspectRatio="xMidYMid meet".
  const p = diagramToClient(VIEW, cw, ch, c.x, c.y - 16);

  // Near an edge, shift the card inward and slide the caret the other way to compensate,
  // measured in real pixels rather than view-box units.
  const HALF = 130;
  const side = p.x < HALF ? 'start' : p.x > cw - HALF ? 'end' : 'center';

  const lines = tipLines(id, asset);

  /**
   * Flip below when there isn't room above.
   *
   * The data-centre hall is the tallest thing on site and sits near the top of the frame, so a
   * card opening upward from its roof ran off the panel. Height is estimated from the row count
   * rather than measured, which avoids a layout-measure-relayout pass on every hover.
   */
  const estHeight = 42 + lines.length * 19 + (asset.alarms.length > 0 ? 34 : 0);
  const flip = p.y - estHeight < 4;
  const top = flip ? p.y + box.h * p.scale * 0.6 : p.y;

  return (
    <div
      className="iso-tip"
      data-side={side}
      data-flip={flip || undefined}
      style={{ left: p.x, top }}
    >
      <div className="iso-tip-head">
        <span className="iso-tip-dot" data-state={asset.state} aria-hidden="true" />
        <span className="iso-tip-name">{label}</span>
        <span className="iso-tip-state" data-state={asset.state}>
          {STATE_LABEL[asset.state]}
        </span>
      </div>
      {lines.length > 0 && (
        <dl className="iso-tip-rows">
          {lines.map((l) => (
            <div key={l.k} className="iso-tip-row">
              <dt>{l.k}</dt>
              <dd className="metric">{l.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {asset.alarms.length > 0 && (
        <div className="iso-tip-alarm" data-severity={asset.alarms[0].severity}>
          {asset.alarms.length === 1
            ? asset.alarms[0].message
            : `${asset.alarms.length} active alarms · ${asset.alarms[0].code}`}
        </div>
      )}
      <span className="iso-tip-caret" aria-hidden="true" />
    </div>
  );
}

/** Two or three headline numbers per asset type — enough to triage without opening the drawer. */
function tipLines(id: string, asset: Asset): { k: string; v: string }[] {
  if ('pcs' in asset) {
    const skid = asset as SkidAsset;
    if (skid.pcs === null || skid.battery === null) {
      return [{ k: 'Telemetry', v: 'None — comms lost' }];
    }
    const out = [
      { k: 'Output', v: `${fmtMW(skid.pcs.power_kW)} MW` },
      { k: 'State of charge', v: `${fmt(skid.battery.soc_pct, 0)} %` },
      { k: 'Max cell', v: `${fmt(skid.battery.cell_temp_max_C, 1)} °C` },
    ];
    const env = skid.battery.envelope?.max_discharge_kW;
    if (env != null && env < NAMEPLATE.pcs_kW) {
      out.push({ k: 'Derated to', v: `${fmtMW(env)} MW` });
    }
    return out;
  }

  if (id === 'LOAD') {
    const m = (asset as LoadAsset).metrics;
    return [
      { k: 'Facility', v: `${fmt(m.power_MW, 1)} MW` },
      { k: 'IT load', v: `${fmt(m.it_load_MW, 1)} MW` },
      { k: 'PUE', v: fmt(m.pue, 2) },
    ];
  }

  const m = (asset as SubstationAsset).metrics;
  return [
    { k: 'Grid import', v: `${fmt(m.power_MW, 1)} MW` },
    { k: 'Voltage', v: `${fmt(m.voltage_kV, 1)} kV` },
    { k: 'Frequency', v: `${fmt(m.frequency_Hz, 2)} Hz` },
  ];
}
