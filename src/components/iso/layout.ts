/**
 * Physical site plan, matching the brief's Figure 1.
 *
 * This view is a *site plan* — where equipment physically stands — whereas the single-line
 * diagram is a *schematic*. That is why the two flow in opposite directions: the figure runs
 * transmission -> substation -> skids -> data centre from right to left, while the topology
 * JSON runs substation -> skids -> load from left to right. Both conventions coexist in real
 * control rooms, and each view follows its own.
 */

import type { Box } from './iso';

/** Ground slab the whole site sits on. */
export const GROUND: Box = { x: -108, y: -3.5, z: -18, w: 372, h: 3.5, d: 88 };

/** Containerised skid: long along X, matching the figure's proportions. */
const SKID_W = 40;
const SKID_H = 11;
const SKID_D = 15;

/** Two rows of three, the back row offset — as drawn. */
export const SKID_BOXES: Record<string, Box> = {
  'SKID-1': { x: 6, y: 0, z: 2, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-2': { x: 58, y: 0, z: 2, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-3': { x: 110, y: 0, z: 2, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-4': { x: 6, y: 0, z: 32, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-5': { x: 58, y: 0, z: 32, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-6': { x: 110, y: 0, z: 32, w: SKID_W, h: SKID_H, d: SKID_D },
};

/** Data-centre hall, plus the low annex and rooftop plant the figure shows. */
export const LOAD_BOX: Box = { x: -98, y: 0, z: -4, w: 64, h: 36, d: 52 };
export const LOAD_ANNEX: Box = { x: -42, y: 0, z: 8, w: 24, h: 17, d: 34 };
export const LOAD_PLANT: Box[] = [
  { x: -36, y: 17, z: 13, w: 8, h: 6, d: 8 },
  { x: -36, y: 17, z: 28, w: 8, h: 6, d: 8 },
  { x: -22, y: 0, z: 20, w: 7, h: 7, d: 9 },
];

/** Substation pad, main transformer tank and its cooling radiators. */
export const SUB_PAD: Box = { x: 176, y: 0, z: 4, w: 56, h: 2, d: 44 };
export const SUB_BOX: Box = { x: 188, y: 2, z: 13, w: 32, h: 21, d: 26 };
export const SUB_RADS: Box[] = [
  { x: 182, y: 2, z: 16, w: 5, h: 16, d: 20 },
  { x: 221, y: 2, z: 16, w: 5, h: 16, d: 20 },
];
/** Bushings on the transformer lid. */
export const SUB_BUSHINGS: Box[] = [
  { x: 193, y: 23, z: 21, w: 3, h: 9, d: 3 },
  { x: 202, y: 23, z: 21, w: 3, h: 12, d: 3 },
  { x: 211, y: 23, z: 21, w: 3, h: 9, d: 3 },
];

/**
 * Transmission pylon. Drawn as lines rather than boxes: a lattice tower rendered as solids at
 * this scale reads as a grey blob, and the figure draws it as a wireframe too.
 */
export const PYLON = {
  /** Base corners and apex, in world space. */
  x: 276,
  z: 20,
  baseHalf: 16,
  height: 74,
  /** Cross-arm heights and half-spans. */
  arms: [
    { y: 46, half: 25 },
    { y: 59, half: 20 },
  ],
};

/** Where the feeder trenches run, drawn flat on the ground. */
export const FEEDER_Y = 0.4;
