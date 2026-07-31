/**
 * Isometric projection.
 *
 * Pure maths, no React, unit-tested — the same discipline as the simulator. World space is
 * right-handed with Y up: X runs back-right, Z runs front-right, Y is height.
 *
 * True isometric (30°) rather than the 2:1 "game" isometric, because the brief's own Figure 1
 * is drawn at 30° and the whole point of this view is to match it.
 */

export const COS30 = Math.cos(Math.PI / 6);
export const SIN30 = 0.5;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** World -> screen. Larger X goes right-and-down, larger Z left-and-down, larger Y straight up. */
export function project(x: number, y: number, z: number): Pt {
  return { x: (x - z) * COS30, y: (x + z) * SIN30 - y };
}

export const polygon = (pts: Pt[]): string =>
  pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

export interface Box {
  /** Minimum corner. */
  x: number;
  y: number;
  z: number;
  /** Extents along X, Y (height) and Z. */
  w: number;
  h: number;
  d: number;
}

export interface BoxFaces {
  /** The +Y face — brightest, catches the light. */
  top: string;
  /** The +X face — the right-hand wall. */
  right: string;
  /** The +Z face — the left-hand wall, in shadow. */
  left: string;
}

/**
 * The three faces of a box that face the camera.
 *
 * Only three are ever visible in an isometric view, so the hidden three are never emitted —
 * that is a 2x saving on DOM nodes across a scene this size.
 */
export function boxFaces(b: Box): BoxFaces {
  const { x, y, z, w, h, d } = b;
  const p = project;

  return {
    top: polygon([p(x, y + h, z), p(x + w, y + h, z), p(x + w, y + h, z + d), p(x, y + h, z + d)]),
    right: polygon([
      p(x + w, y, z),
      p(x + w, y + h, z),
      p(x + w, y + h, z + d),
      p(x + w, y, z + d),
    ]),
    left: polygon([p(x, y, z + d), p(x, y + h, z + d), p(x + w, y + h, z + d), p(x + w, y, z + d)]),
  };
}

/** A flat quad on the ground (or on top of a box), for slabs and roof strips. */
export function quad(x: number, y: number, z: number, w: number, d: number): string {
  const p = project;
  return polygon([p(x, y, z), p(x + w, y, z), p(x + w, y, z + d), p(x, y, z + d)]);
}

/**
 * Painter's-algorithm sort key.
 *
 * Boxes further from the camera have a smaller x + z + y and must be drawn first. Exact for
 * axis-aligned boxes that do not interpenetrate, which is every object in this scene.
 */
export function depth(b: Box): number {
  return b.x + b.z + b.y;
}

export function sortByDepth<T extends { box: Box }>(items: T[]): T[] {
  return [...items].sort((a, b) => depth(a.box) - depth(b.box));
}

/**
 * A soft contact shadow on the ground beneath a box.
 *
 * Isometric scenes read flat without one — every building appears to float at the same depth.
 * Offset along +X/+Z so the light direction agrees with the face shading.
 */
export function groundShadow(b: Box, spread = 2.5): string {
  return quad(b.x + spread, 0.06, b.z + spread, b.w, b.d);
}

/** Screen-space centre of a box's top face — where labels and "+" markers anchor. */
export function topCentre(b: Box): Pt {
  return project(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2);
}

/** Bounding box of projected points, for computing a fitted viewBox. */
export function screenBounds(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** All eight projected corners of a box — used to fit the view around the whole scene. */
export function boxCorners(b: Box): Pt[] {
  const { x, y, z, w, h, d } = b;
  const out: Pt[] = [];
  for (const dx of [0, w]) {
    for (const dy of [0, h]) {
      for (const dz of [0, d]) out.push(project(x + dx, y + dy, z + dz));
    }
  }
  return out;
}
