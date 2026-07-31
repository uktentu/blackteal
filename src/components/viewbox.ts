/**
 * View-box math for the diagram's zoom/pan.
 *
 * Pure and unit-tested. The interaction handlers in Diagram.tsx stay thin, and the math that
 * decides what an operator is looking at is testable without a DOM.
 */

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zoom-out floor: half the fitted view, enough to breathe around a vast site. */
export const MIN_ZOOM = 0.5;
/** Zoom-in ceiling: 4x, enough to isolate one skid in a dense cluster. */
export const MAX_ZOOM = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Current magnification relative to the fitted base view. */
export function zoomLevel(vb: ViewBox, base: ViewBox): number {
  return base.w / vb.w;
}

/**
 * Zoom by `factor` (>1 zooms in) about a fixed point in diagram coordinates.
 * The point under the cursor stays stationary — zoom that drifts away from the pointer is the
 * single most disorienting thing a pannable surface can do.
 */
export function zoomAt(vb: ViewBox, base: ViewBox, factor: number, px: number, py: number): ViewBox {
  const zoom = clamp((base.w / vb.w) * factor, MIN_ZOOM, MAX_ZOOM);
  const w = base.w / zoom;
  const h = base.h / zoom;
  const x = px - ((px - vb.x) / vb.w) * w;
  const y = py - ((py - vb.y) / vb.h) * h;
  return clampPan({ x, y, w, h }, base);
}

/** Pan by a delta in diagram coordinates. */
export function pan(vb: ViewBox, base: ViewBox, dx: number, dy: number): ViewBox {
  return clampPan({ ...vb, x: vb.x + dx, y: vb.y + dy }, base);
}

/** Center the view on a point, keeping the current zoom. */
export function centerOn(vb: ViewBox, base: ViewBox, cx: number, cy: number): ViewBox {
  return clampPan({ ...vb, x: cx - vb.w / 2, y: cy - vb.h / 2 }, base);
}

/** True when the point is inside the box, inset by `margin`. */
export function contains(vb: ViewBox, x: number, y: number, margin = 0): boolean {
  return (
    x >= vb.x + margin && x <= vb.x + vb.w - margin && y >= vb.y + margin && y <= vb.y + vb.h - margin
  );
}

/**
 * Keep at least 20% of the view overlapping the diagram, so the site can never be panned
 * entirely out of frame — "where did my plant go" is not a state an operator should reach.
 */
function clampPan(vb: ViewBox, base: ViewBox): ViewBox {
  return {
    ...vb,
    x: clamp(vb.x, base.x - vb.w * 0.8, base.x + base.w - vb.w * 0.2),
    y: clamp(vb.y, base.y - vb.h * 0.8, base.y + base.h - vb.h * 0.2),
  };
}

/**
 * Client-pixel -> diagram coordinates under preserveAspectRatio="xMidYMid meet".
 * Accounts for the letterbox offset that `meet` introduces when the element's aspect ratio
 * differs from the view box's — ignoring it makes zoom-at-cursor drift near the edges.
 */
export function clientToDiagram(vb: ViewBox, cw: number, ch: number, mx: number, my: number) {
  const scale = Math.min(cw / vb.w, ch / vb.h);
  const ox = (cw - vb.w * scale) / 2;
  const oy = (ch - vb.h * scale) / 2;
  return { x: vb.x + (mx - ox) / scale, y: vb.y + (my - oy) / scale, scale };
}

/** Diagram -> client-pixel, the inverse. Used to anchor screen-space overlays to nodes. */
export function diagramToClient(vb: ViewBox, cw: number, ch: number, x: number, y: number) {
  const scale = Math.min(cw / vb.w, ch / vb.h);
  const ox = (cw - vb.w * scale) / 2;
  const oy = (ch - vb.h * scale) / 2;
  return { x: ox + (x - vb.x) * scale, y: oy + (y - vb.y) * scale, scale };
}
