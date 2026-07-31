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

/**
 * Pivot the intro rotation turns about — roughly the centre of the plant, so the site swings
 * around itself rather than orbiting the world origin and flying off screen.
 */
export const PIVOT = { x: 68, z: 26 };

/**
 * World -> screen. Larger X goes right-and-down, larger Z left-and-down, larger Y straight up.
 *
 * `yaw` rotates the scene about the vertical axis before projecting. It exists for the intro
 * reveal: an isometric projection loses a dimension, so a real turn cannot be faked with a 2D
 * transform of already-projected points — the geometry has to be re-projected.
 */
export function project(x: number, y: number, z: number, yaw = 0): Pt {
  if (yaw !== 0) {
    const dx = x - PIVOT.x;
    const dz = z - PIVOT.z;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    x = PIVOT.x + dx * c - dz * sn;
    z = PIVOT.z + dx * sn + dz * c;
  }
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
export function boxFaces(b: Box, yaw = 0): BoxFaces {
  const { x, y, z, w, h, d } = b;
  const p = (px: number, py: number, pz: number) => project(px, py, pz, yaw);

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
export function quad(x: number, y: number, z: number, w: number, d: number, yaw = 0): string {
  const p = (px: number, py: number, pz: number) => project(px, py, pz, yaw);
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
export function groundShadow(b: Box, spread = 2.5, yaw = 0): string {
  return quad(b.x + spread, 0.06, b.z + spread, b.w, b.d, yaw);
}

/** Screen-space centre of a box's top face — where labels and "+" markers anchor. */
export function topCentre(b: Box, yaw = 0): Pt {
  return project(b.x + b.w / 2, b.y + b.h, b.z + b.d / 2, yaw);
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
export function boxCorners(b: Box, yaw = 0): Pt[] {
  const { x, y, z, w, h, d } = b;
  const out: Pt[] = [];
  for (const dx of [0, w]) {
    for (const dy of [0, h]) {
      for (const dz of [0, d]) out.push(project(x + dx, y + dy, z + dz, yaw));
    }
  }
  return out;
}
