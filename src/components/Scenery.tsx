/**
 * The landscape around the plant.
 *
 * One continuous ground surface with organic variation, not a grid of tiles. Everything is
 * inert: `aria-hidden`, no pointer events, no focus stop, no status colour — it gives the site
 * a place and a sense of scale without ever competing with the compound for attention.
 *
 * Memoized on yaw alone: scenery never changes with telemetry, so a 1 Hz tick must not
 * re-render a thousand elements.
 */

import { memo } from 'react';
import { boxFaces, polygon, project, quad } from './iso/iso';
import {
  BARNS,
  FENCE,
  fromScreen,
  HALLS,
  HOUSES,
  LAND_CORNERS,
  MEADOWS,
  PANEL,
  SILOS,
  SOLAR_FAR,
  SOLAR_ROWS,
  TRACKS,
  TREES,
  TUFTS,
  TURBINES,
} from './iso/scenery';

/** Screen-aligned ground point -> screen. */
const g = (u: number, v: number, yaw: number, y = 0) => {
  const w = fromScreen(u, v);
  return project(w.x, y, w.z, yaw);
};

/** Widen a screen-space polyline into a ribbon, for the service tracks. */
function ribbon(points: { u: number; v: number }[], halfWidth: number, yaw: number): string {
  const left = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const du = next.u - prev.u;
    const dv = next.v - prev.v;
    const len = Math.hypot(du, dv) || 1;
    return g(p.u - (dv / len) * halfWidth, p.v + (du / len) * halfWidth, yaw, 0.05);
  });
  const right = points
    .map((p, i) => {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const du = next.u - prev.u;
      const dv = next.v - prev.v;
      const len = Math.hypot(du, dv) || 1;
      return g(p.u + (dv / len) * halfWidth, p.v - (du / len) * halfWidth, yaw, 0.05);
    })
    .reverse();
  return polygon([...left, ...right]);
}

/** A block of tilted PV rows. */
function SolarBlock({ rows, yaw, cls }: { rows: typeof SOLAR_ROWS; yaw: number; cls: string }) {
  return (
    <g className={cls}>
      {rows.map((b, i) => (
        <g key={i}>
          <polygon className="scn-solar-shadow" points={quad(b.x + 2, 0.04, b.z + 2, b.w, b.d, yaw)} />
          <polygon
            className="scn-panel"
            points={polygon([
              project(b.x, 0, b.z + b.d, yaw),
              project(b.x + b.w, 0, b.z + b.d, yaw),
              project(b.x + b.w, PANEL.height, b.z, yaw),
              project(b.x, PANEL.height, b.z, yaw),
            ])}
          />
        </g>
      ))}
    </g>
  );
}

export const Scenery = memo(function Scenery({ yaw }: { yaw: number }) {
  return (
    <g className="scn" aria-hidden="true" pointerEvents="none">
      <defs>
        {/* Panel glass: a cool sheen across the tilt, so a row reads as a surface catching
            light rather than as a flat slab. */}
        <linearGradient id="pvFace" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#3c5170" />
          <stop offset="55%" stopColor="#2b3b53" />
          <stop offset="100%" stopColor="#212f42" />
        </linearGradient>
        {/*
          Atmospheric falloff, centred on the compound. Bright at the plant, sinking to the
          page background at the edges — it focuses the eye, dissolves the terrain boundary,
          and gives the flat ground plane depth, all in one element.
        */}
        {/*
          Atmospheric falloff. Held well short of opaque at the rim: pushed to full strength it
          erased the very scenery it exists to sit behind, leaving the frame emptier than
          before. Depth, not a mask.
        */}
        <radialGradient id="siteFalloff" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor="#0f1317" stopOpacity="0" />
          <stop offset="40%" stopColor="#0f1317" stopOpacity="0.12" />
          <stop offset="70%" stopColor="#0f1317" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#0f1317" stopOpacity="0.82" />
        </radialGradient>
      </defs>

      {/* ---- base terrain: one surface, no visible edge ---- */}
      <polygon
        className="scn-ground"
        points={polygon(LAND_CORNERS.map((c) => project(c.x, 0, c.z, yaw)))}
      />

      {/* ---- broad tonal variation; blurred as a group so no boundary reads as an edge ---- */}
      <g className="scn-meadows">
        {MEADOWS.map((m, i) => (
          <polygon
            key={`m${i}`}
            className="scn-meadow"
            data-tone={m.tone}
            points={polygon(m.points.map((p) => g(p.u, p.v, yaw)))}
          />
        ))}
      </g>

      {/* ---- service tracks ---- */}
      {TRACKS.map((t, i) => (
        <polygon key={`k${i}`} className="scn-track" points={ribbon(t.points, t.halfWidth, yaw)} />
      ))}

      {/* ---- ground texture ---- */}
      <g className="scn-tufts">
        {TUFTS.map((t, i) => {
          const a = project(t.x, 0, t.z, yaw);
          const b = project(t.x, t.len, t.z, yaw);
          return (
            <path
              key={`g${i}`}
              d={`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`}
            />
          );
        })}
      </g>

      {/* ---- solar farms ---- */}
      <SolarBlock rows={SOLAR_FAR} yaw={yaw} cls="scn-solar scn-solar-far" />
      <SolarBlock rows={SOLAR_ROWS} yaw={yaw} cls="scn-solar" />

      {/* ---- neighbouring campus halls: flat-roofed, with rooftop plant ---- */}
      {HALLS.map((h, i) => {
        const f = boxFaces(h.box, yaw);
        return (
          <g key={`hall${i}`} className="scn-hall">
            <polygon
              className="scn-shadow"
              points={quad(h.box.x + 3, 0.03, h.box.z + 3, h.box.w, h.box.d, yaw)}
            />
            <polygon className="scn-hall-left" points={f.left} />
            <polygon className="scn-hall-right" points={f.right} />
            <polygon className="scn-hall-top" points={f.top} />
            {h.plant.map((p, k) => {
              const pf = boxFaces(p, yaw);
              return (
                <g key={k}>
                  <polygon className="scn-hall-left" points={pf.left} />
                  <polygon className="scn-hall-right" points={pf.right} />
                  <polygon className="scn-hall-top" points={pf.top} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* ---- village and farm sheds ---- */}
      {[...HOUSES, ...BARNS].map((h, i) => {
        const b = h.box;
        const f = boxFaces(b, yaw);
        const eaveFL = project(b.x, b.h, b.z + b.d, yaw);
        const eaveFR = project(b.x + b.w, b.h, b.z + b.d, yaw);
        const eaveBL = project(b.x, b.h, b.z, yaw);
        const eaveBR = project(b.x + b.w, b.h, b.z, yaw);
        const ridgeL = project(b.x, b.h + h.roof, b.z + b.d / 2, yaw);
        const ridgeR = project(b.x + b.w, b.h + h.roof, b.z + b.d / 2, yaw);

        return (
          <g key={`h${i}`} className="scn-house">
            <polygon className="scn-shadow" points={quad(b.x + 2, 0.03, b.z + 2, b.w, b.d, yaw)} />
            <polygon className="scn-wall scn-wall-left" points={f.left} />
            <polygon className="scn-wall scn-wall-right" points={f.right} />
            <polygon className="scn-roof scn-roof-front" points={polygon([eaveFL, eaveFR, ridgeR, ridgeL])} />
            <polygon className="scn-roof scn-roof-back" points={polygon([eaveBL, eaveBR, ridgeR, ridgeL])} />
          </g>
        );
      })}

      {/* ---- grain silos: cylinders, so a body quad plus an elliptical cap ---- */}
      {SILOS.map((s, i) => {
        const base = project(s.x, 0, s.z, yaw);
        const top = project(s.x, s.h, s.z, yaw);
        return (
          <g key={`si${i}`} className="scn-silo">
            <ellipse className="scn-shadow" cx={base.x + 3} cy={base.y + 1} rx={s.r * 1.1} ry={s.r * 0.5} />
            <polygon
              className="scn-silo-body"
              points={polygon([
                { x: base.x - s.r, y: base.y },
                { x: base.x + s.r, y: base.y },
                { x: top.x + s.r, y: top.y },
                { x: top.x - s.r, y: top.y },
              ])}
            />
            <ellipse className="scn-silo-cap" cx={top.x} cy={top.y} rx={s.r} ry={s.r * 0.45} />
          </g>
        );
      })}

      {/* ---- trees ---- */}
      {TREES.map((t, i) => {
        const base = project(t.x, 0, t.z, yaw);
        const mid = project(t.x, t.r * 1.2, t.z, yaw);
        const crown = project(t.x, t.r * 2, t.z, yaw);
        return (
          <g key={`t${i}`} className="scn-tree">
            <ellipse className="scn-shadow" cx={base.x + 2} cy={base.y + 1} rx={t.r} ry={t.r * 0.42} />
            <path
              className="scn-trunk"
              d={`M${base.x.toFixed(1)} ${base.y.toFixed(1)} L${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`}
            />
            <ellipse className="scn-canopy" cx={crown.x} cy={crown.y} rx={t.r} ry={t.r * 1.05} />
          </g>
        );
      })}

      {/* ---- turbines on the far ridge ---- */}
      {TURBINES.map((t, i) => {
        const base = project(t.x, 0, t.z, yaw);
        const hub = project(t.x, t.h, t.z, yaw);
        return (
          <g key={`w${i}`} className="scn-turbine">
            <path
              className="scn-mast"
              d={`M${base.x.toFixed(1)} ${base.y.toFixed(1)} L${hub.x.toFixed(1)} ${hub.y.toFixed(1)}`}
            />
            {[90, 210, 330].map((deg) => {
              const a = ((deg + i * 27) * Math.PI) / 180;
              return (
                <path
                  key={deg}
                  className="scn-blade"
                  d={`M${hub.x.toFixed(1)} ${hub.y.toFixed(1)} L${(hub.x + Math.cos(a) * t.r).toFixed(1)} ${(hub.y + Math.sin(a) * t.r * 0.8).toFixed(1)}`}
                />
              );
            })}
            <circle className="scn-hub" cx={hub.x} cy={hub.y} r={2.2} />
          </g>
        );
      })}

      {/* ---- compound fence: where the operator's responsibility begins ---- */}
      <polygon
        className="scn-fence"
        points={polygon([
          g(FENCE.u, FENCE.v, yaw, 0.08),
          g(FENCE.u + FENCE.du, FENCE.v, yaw, 0.08),
          g(FENCE.u + FENCE.du, FENCE.v + FENCE.dv, yaw, 0.08),
          g(FENCE.u, FENCE.v + FENCE.dv, yaw, 0.08),
        ])}
      />
    </g>
  );
});
