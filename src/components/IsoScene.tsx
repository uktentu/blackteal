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
  BUSHING_TOPS,
  FEEDER_Y,
  GROUND,
  LINE_ATTACH,
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
import { Scenery } from './Scenery';

import './iso.css';
import './scenery.css';

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
  project(PYLON.x, PYLON.height + PYLON.peak, PYLON.z),
  // The arms reach well past the mast; fitting to the centre line alone clipped them.
  project(PYLON.x - PYLON.arms[0].half, 0, PYLON.z),
  project(PYLON.x + PYLON.arms[0].half, 0, PYLON.z),
  project(PYLON.x + PYLON.arms[0].half, PYLON.arms[0].y, PYLON.z),
]);

/** Label gutters: a band on top for the skid group label, a little breathing room below. */
const GUTTER = { top: 46, bottom: 20 };

/**
 * Target frame proportion.
 *
 * Height is set by the plant — it must always fit — and width is then derived to match a wide
 * control-room panel. Because the terrain runs far past the compound, the extra width simply
 * reveals more landscape instead of leaving dead margins, and the ground has no visible edge
 * in any direction.
 */
const FRAME_ASPECT = 3.0;


const VIEW = (() => {
  const h = SCENE.maxY - SCENE.minY + GUTTER.top + GUTTER.bottom;
  const w = h * FRAME_ASPECT;
  const cx = (SCENE.minX + SCENE.maxX) / 2;
  return { x: cx - w / 2, y: SCENE.minY - GUTTER.top, w, h };
})();

/**
 * Where the skid-group label points.
 *
 * The roof of the back-row middle container, not the block's centroid: the centroid projects
 * to a point *inside* the cluster, hidden behind the front row, so the leader appeared to end
 * in empty air just above the site.
 */
const SKID_LABEL_ANCHOR = topCentre(SKID_BOXES['SKID-2']);

/** Yaw the scene starts at, swinging back to square during the intro. */
const INTRO_YAW = -0.42;
const INTRO_MS = 1500;

/** Cubic ease-out: quick commitment, gentle settle — a machine coming to rest, not a bounce. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Drives the opening reveal.
 *
 * Returns the live yaw and a 0..1 progress the staggered element reveals key off. Honours
 * prefers-reduced-motion by jumping straight to the settled state — an unrequested intro
 * animation is exactly what that setting exists to suppress.
 */
function useIntro(active: boolean) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const [t, setT] = useState(active && !reduced ? 0 : 1);

  useEffect(() => {
    if (!active || reduced) {
      setT(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / INTRO_MS);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);

  return { t, yaw: INTRO_YAW * (1 - easeOut(t)), done: t >= 1 };
}
const SKID_LABEL_X = SKID_LABEL_ANCHOR.x;

/** A solid, shaded box. Three faces only — the other three never face this camera. */
function Solid({
  box,
  cls,
  yaw = 0,
  delay = 0,
  shadow = true,
}: {
  box: Box;
  cls: string;
  yaw?: number;
  delay?: number;
  shadow?: boolean;
}) {
  const f = boxFaces(box, yaw);
  return (
    <g className={`${cls} iso-in`} style={{ animationDelay: `${delay}ms` }}>
      {shadow && <polygon className="iso-shadow" points={groundShadow(box, 2.5, yaw)} />}
      <polygon className="iso-face iso-left" points={f.left} />
      <polygon className="iso-face iso-right" points={f.right} />
      <polygon className="iso-face iso-top" points={f.top} />
    </g>
  );
}

/** Site grid on the slab — surveyor's lines, faint enough to read as texture. */
function GroundGrid({ yaw }: { yaw: number }) {
  const step = 26;
  const lines: string[] = [];
  for (let x = GROUND.x; x <= GROUND.x + GROUND.w + 0.1; x += step) {
    const a = project(x, 0.02, GROUND.z, yaw);
    const b = project(x, 0.02, GROUND.z + GROUND.d, yaw);
    lines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  for (let z = GROUND.z; z <= GROUND.z + GROUND.d + 0.1; z += step) {
    const a = project(GROUND.x, 0.02, z, yaw);
    const b = project(GROUND.x + GROUND.w, 0.02, z, yaw);
    lines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  return (
    <g className="iso-grid iso-in" aria-hidden="true" style={{ animationDelay: '120ms' }}>
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
  yaw: number;
  delay: number;
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
  function IsoAsset({ id, box, asset, yaw, delay, selected, flashed, stale, onSelect, onHover }: AssetProps) {
    const state: AssetState = asset.state;
    const f = boxFaces(box, yaw);
    const c = topCentre(box, yaw);
    const label = TOPOLOGY.assets.find((a) => a.id === id)?.label ?? id;

    // The status strip runs along the roof edge, exactly as the figure draws it.
    const strip = quad(box.x, box.y + box.h + 0.05, box.z, box.w, 3.6, yaw);

    return (
      <g
        className="iso-asset iso-in"
        style={{ animationDelay: `${delay}ms` }}
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
        <polygon className="iso-shadow" points={groundShadow(box, 2.5, yaw)} />
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
    a.stale === b.stale &&
    // Re-render through the intro; once settled, yaw stops changing and memoization resumes.
    a.yaw === b.yaw,
);

/**
 * Lattice transmission tower.
 *
 * Built as a real truss rather than four lines: tapered legs, horizontal bracing bands, and
 * X-bracing in every bay between them, which is what makes a pylon read as a pylon. Cross-arms
 * carry hanging insulator strings, and the conductors run off toward the substation.
 */
function Pylon({ yaw }: { yaw: number }) {
  const { x, z, baseHalf, topHalf, height, bands, arms, peak } = PYLON;
  const p = (px: number, py: number, pz: number) => project(px, py, pz, yaw);
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `M${a.x.toFixed(2)} ${a.y.toFixed(2)} L${b.x.toFixed(2)} ${b.y.toFixed(2)}`;

  /** Half-width at a given height fraction — linear taper. */
  const halfAt = (t: number) => baseHalf + (topHalf - baseHalf) * t;
  /** The four leg positions at a height fraction. */
  const cornersAt = (t: number) => {
    const s = halfAt(t);
    const y = height * t;
    return [
      p(x - s, y, z - s),
      p(x + s, y, z - s),
      p(x + s, y, z + s),
      p(x - s, y, z + s),
    ];
  };

  const rings = bands.map((t) => polygon(cornersAt(t)));

  // Legs: one continuous path per corner, following the taper through every band.
  const legs = [0, 1, 2, 3].map((corner) =>
    bands
      .map((t, i) => {
        const c = cornersAt(t)[corner];
        return `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
      })
      .join(' '),
  );

  // X-bracing: both diagonals across each bay, on the two faces the camera can see.
  const braces: string[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const lower = cornersAt(bands[i]);
    const upper = cornersAt(bands[i + 1]);
    for (const [a, b] of [
      [1, 2],
      [2, 3],
    ] as const) {
      braces.push(seg(lower[a], upper[b]), seg(lower[b], upper[a]));
    }
  }

  const apex = p(x, height + peak, z);
  const topRing = cornersAt(1);

  return (
    <g className="iso-pylon" aria-hidden="true">
      {rings.map((r, i) => (
        <polygon key={`r${i}`} className="iso-pylon-ring" points={r} />
      ))}
      {braces.map((d, i) => (
        <path key={`b${i}`} className="iso-pylon-brace" d={d} />
      ))}
      {legs.map((d, i) => (
        <path key={`l${i}`} className="iso-pylon-leg" d={d} />
      ))}

      {/* Peak */}
      {topRing.map((c, i) => (
        <path key={`p${i}`} className="iso-pylon-brace" d={seg(c, apex)} />
      ))}

      {/* Cross-arms with hanging insulator strings and their conductors. */}
      {arms.map((a) => {
        const l = p(x - a.half, a.y, z);
        const r = p(x + a.half, a.y, z);
        const cl = p(x - a.half * 0.45, a.y, z);
        const cr = p(x + a.half * 0.45, a.y, z);
        const hangers = [
          [x - a.half, a.y],
          [x + a.half, a.y],
          [x - a.half * 0.45, a.y],
          [x + a.half * 0.45, a.y],
        ] as const;

        return (
          <g key={a.y}>
            <path className="iso-pylon-arm" d={seg(l, r)} />
            {/* Triangulation back to the mast, so the arm doesn't look glued on. */}
            <path className="iso-pylon-brace" d={seg(l, p(x, a.y + 9, z))} />
            <path className="iso-pylon-brace" d={seg(r, p(x, a.y + 9, z))} />
            <path className="iso-pylon-brace" d={seg(cl, p(x, a.y + 5, z))} />
            <path className="iso-pylon-brace" d={seg(cr, p(x, a.y + 5, z))} />
            {hangers.map(([hx, hy], i) => (
              <path
                key={`h${i}`}
                className="iso-pylon-insulator"
                d={seg(p(hx, hy, z), p(hx, hy - a.drop, z))}
              />
            ))}
          </g>
        );
      })}

      {/*
        The three phase conductors, each landing on its own HV bushing.
        Sag is a real catenary dip applied in world space before projection, so it reads
        correctly at any yaw rather than being a fixed screen-space curve.
      */}
      {LINE_ATTACH.map((a, i) => {
        const t = BUSHING_TOPS[i];
        const from = p(a.x, a.y, a.z);
        const to = p(t.x, t.y, t.z);
        const sag = 5;
        const ctrl = p((a.x + t.x) / 2, (a.y + t.y) / 2 - sag * 2, (a.z + t.z) / 2);
        return (
          <path
            key={`cond${i}`}
            className="iso-conductor"
            d={`M${from.x.toFixed(2)} ${from.y.toFixed(2)} Q${ctrl.x.toFixed(2)} ${ctrl.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`}
          />
        );
      })}

      {/* The line continues away from the site on the far side. */}
      {arms.map((a) =>
        [a.half, a.half * 0.45].map((off) => {
          const from = p(x + off, a.y - a.drop, z);
          const to = p(x + off + 34, a.y - a.drop - 6, z);
          const ctrl = p(x + off + 17, a.y - a.drop - 8, z);
          return (
            <path
              key={`out${a.y}${off}`}
              className="iso-conductor"
              d={`M${from.x.toFixed(2)} ${from.y.toFixed(2)} Q${ctrl.x.toFixed(2)} ${ctrl.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`}
            />
          );
        }),
      )}
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
  const { t: intro, yaw, done: introDone } = useIntro(true);
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
        const from = project(SUB_PAD.x, FEEDER_Y, b.z + b.d / 2, yaw);
        const to = project(b.x + b.w, FEEDER_Y, b.z + b.d / 2, yaw);
        const out = project(b.x, FEEDER_Y, b.z + b.d / 2, yaw);
        const load = project(LOAD_BOX.x + LOAD_BOX.w, FEEDER_Y, b.z + b.d / 2, yaw);
        return { id, feed: `M${from.x} ${from.y} L${to.x} ${to.y}`, tap: `M${out.x} ${out.y} L${load.x} ${load.y}` };
      }),
    [yaw],
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
        data-intro={!introDone || undefined}
        style={{ '--intro': intro } as React.CSSProperties}
      >
        {/* ground */}
        <g className="iso-in" style={{ animationDelay: '0ms' }}>
          <Scenery yaw={yaw} />
          {/* Painted over the landscape but under the plant: the compound must stay the
              brightest thing on screen. */}
          {/* Oversized by 30%: sized exactly to the view box it left a bright rim of raw
              terrain at the frame edges wherever the panel aspect differed from the view's. */}
          <rect
            className="scn-falloff"
            x={VIEW.x - VIEW.w * 0.3}
            y={VIEW.y - VIEW.h * 0.3}
            width={VIEW.w * 1.6}
            height={VIEW.h * 1.6}
            fill="url(#siteFalloff)"
          />
        </g>

        <g className="iso-ground iso-in" style={{ animationDelay: '160ms' }}>
          <polygon className="iso-ground-side" points={boxFaces(GROUND, yaw).right} />
          <polygon className="iso-ground-side" points={boxFaces(GROUND, yaw).left} />
          <polygon className="iso-ground-top" points={boxFaces(GROUND, yaw).top} />
        </g>
        <GroundGrid yaw={yaw} />

        {/* feeder runs, under everything */}
        <g className="iso-feeders iso-in" aria-hidden="true" style={{ animationDelay: '1220ms' }}>
          {feeders.map((f) => (
            <g key={f.id}>
              <path className="iso-feeder" d={f.feed} />
              <path className="iso-feeder" d={f.tap} />
            </g>
          ))}
        </g>

        <g className="iso-in" style={{ animationDelay: '240ms' }}>
          <Pylon yaw={yaw} />
        </g>

        {/* substation structure that isn't itself the clickable asset */}
        <Solid box={SUB_PAD} cls="iso-pad" yaw={yaw} delay={340} />
        {SUB_RADS.map((b) => (
          <Solid key={`${b.x}`} box={b} cls="iso-kit" yaw={yaw} delay={380} />
        ))}

        {/* data-centre outbuildings */}
        <Solid box={LOAD_ANNEX} cls="iso-kit" yaw={yaw} delay={1020} />
        {LOAD_PLANT.map((b, i) => (
          <Solid key={`${b.x}-${b.z}`} box={b} cls="iso-kit" yaw={yaw} delay={1060 + i * 50} />
        ))}

        {/* the inspectable assets, back to front */}
        {ordered.map(({ id, box }, i) => (
          <IsoAsset
            key={id}
            id={id}
            box={box}
            yaw={yaw}
            /* Components arrive in physical order, back to front, so the eye is walked
               across the site rather than shown everything at once. */
            delay={420 + i * 85}
            asset={site.assets[id]}
            selected={selectedId === id}
            flashed={flashedId === id}
            stale={stale}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        ))}

        {/* bushings sit on top of the transformer, so they paint after it */}
        {SUB_BUSHINGS.map((b, i) => (
          <Solid key={`${b.x}`} box={b} cls="iso-kit" yaw={yaw} delay={400 + i * 40} shadow={false} />
        ))}

        {/*
          Annotations live in the TOP gutter, with vertical leaders down to their asset.
          The data-centre label used to sit in the left gutter, but the neighbouring campus
          halls stand outside the plant slab and project further left than it does, so a
          left-anchored label ended up drawn on top of a building. Above the scene there is
          nothing to collide with.
        */}
        {Object.entries(LABELS).map(([id, l]) => {
          const c = topCentre(ASSET_BOX[id], yaw);
          const lx = c.x;
          const ly = VIEW.y + 22;

          return (
            <g
              key={id}
              className="iso-label iso-in"
              aria-hidden="true"
              style={{ animationDelay: '1320ms' }}
            >
              <text className="iso-label-title" x={lx} y={ly} textAnchor="middle">
                {l.title}
              </text>
              <text className="iso-label-sub" x={lx} y={ly + 14} textAnchor="middle">
                {l.sub}
              </text>
              <path
                className="iso-leader"
                d={`M${lx.toFixed(1)} ${(ly + 22).toFixed(1)} V${(c.y - 16).toFixed(1)}`}
              />
              <circle className="iso-leader-dot" cx={lx} cy={c.y - 16} r={2.4} />
            </g>
          );
        })}

        {/* Skid group label, centred over the two rows in the top gutter. */}
        <g className="iso-label iso-in" aria-hidden="true" style={{ animationDelay: '1320ms' }}>
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
