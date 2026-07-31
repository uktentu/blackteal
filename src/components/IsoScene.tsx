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

import { memo, useMemo, useState } from 'react';
import { TOPOLOGY } from '../domain/topology';
import type { Asset, AssetState, SiteState } from '../domain/types';
import { STATE_LABEL } from './format';
import { boxCorners, boxFaces, project, polygon, quad, screenBounds, topCentre, type Box } from './iso/iso';
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

/** Fitted viewBox covering the whole scene, computed once from the layout. */
const VIEW = (() => {
  const pts = [
    ...boxCorners(GROUND),
    ...boxCorners(LOAD_BOX),
    ...Object.values(SKID_BOXES).flatMap(boxCorners),
    ...boxCorners(SUB_PAD),
    project(PYLON.x, PYLON.height, PYLON.z),
  ];
  const b = screenBounds(pts);
  const pad = 18;
  return {
    x: b.minX - pad,
    y: b.minY - pad - 16,
    w: b.maxX - b.minX + pad * 2,
    h: b.maxY - b.minY + pad * 2 + 16,
  };
})();

/** A solid, shaded box. Three faces only — the other three never face this camera. */
function Solid({ box, cls }: { box: Box; cls: string }) {
  const f = boxFaces(box);
  return (
    <g className={cls}>
      <polygon className="iso-face iso-left" points={f.left} />
      <polygon className="iso-face iso-right" points={f.right} />
      <polygon className="iso-face iso-top" points={f.top} />
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
    <div className="iso-wrap">
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

        {/* leader-line labels, as in the figure */}
        {Object.entries(LABELS).map(([id, l]) => {
          const c = topCentre(ASSET_BOX[id]);
          const left = id === 'LOAD';
          const lx = c.x + (left ? -104 : 104);
          const ly = c.y - 54;
          return (
            <g key={id} className="iso-label" aria-hidden="true">
              <path className="iso-leader" d={`M${c.x} ${c.y - 14} L${lx} ${ly}`} />
              <circle className="iso-leader-dot" cx={c.x} cy={c.y - 14} r={2.2} />
              <text className="iso-label-title" x={lx} y={ly - 4} textAnchor={left ? 'end' : 'start'}>
                {l.title}
              </text>
              <text className="iso-label-sub" x={lx} y={ly + 9} textAnchor={left ? 'end' : 'start'}>
                {l.sub}
              </text>
            </g>
          );
        })}

        {/* skid group label */}
        <g className="iso-label" aria-hidden="true">
          <text className="iso-label-title" x={project(60, 0, 2).x} y={VIEW.y + 34} textAnchor="middle">
            BESS Skids
          </text>
          <text className="iso-label-sub" x={project(60, 0, 2).x} y={VIEW.y + 47} textAnchor="middle">
            6 × 2.5 MW / 10 MWh
          </text>
        </g>
      </svg>

      {hovered !== null && <IsoTooltip id={hovered} asset={site.assets[hovered]} />}
    </div>
  );
}

/** Screen-space tooltip, positioned from the asset's projected top centre. */
function IsoTooltip({ id, asset }: { id: string; asset: Asset }) {
  const label = TOPOLOGY.assets.find((a) => a.id === id)?.label ?? id;
  const c = topCentre(ASSET_BOX[id]);
  // Convert scene units to a percentage of the fitted viewBox so it tracks the SVG's scaling.
  const leftPct = ((c.x - VIEW.x) / VIEW.w) * 100;
  const topPct = ((c.y - 22 - VIEW.y) / VIEW.h) * 100;

  return (
    <div className="iso-tip" style={{ left: `${leftPct}%`, top: `${topPct}%` }}>
      <div className="tip-title">{label}</div>
      <div className="tip-line metric">{STATE_LABEL[asset.state]}</div>
      {asset.alarms.length > 0 && (
        <div className="tip-line metric">
          {asset.alarms.length} active alarm{asset.alarms.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
