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
export const GROUND: Box = { x: -104, y: -3.5, z: -30, w: 348, h: 3.5, d: 112 };

/** Containerised skid: long along X, matching the figure's proportions. */
const SKID_W = 40;
const SKID_H = 11;
const SKID_D = 15;

/** Two rows of three, the back row offset — as drawn. */
export const SKID_BOXES: Record<string, Box> = {
  'SKID-1': { x: 6, y: 0, z: 2, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-2': { x: 58, y: 0, z: 2, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-3': { x: 110, y: 0, z: 2, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-4': { x: 6, y: 0, z: 38, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-5': { x: 58, y: 0, z: 38, w: SKID_W, h: SKID_H, d: SKID_D },
  'SKID-6': { x: 110, y: 0, z: 38, w: SKID_W, h: SKID_H, d: SKID_D },
};

/** Data-centre hall, plus the low annex and rooftop plant the figure shows. */
export const LOAD_BOX: Box = { x: -94, y: 0, z: -6, w: 62, h: 34, d: 60 };
export const LOAD_ANNEX: Box = { x: -40, y: 0, z: 10, w: 22, h: 16, d: 36 };
export const LOAD_PLANT: Box[] = [
  { x: -34, y: 16, z: 16, w: 8, h: 6, d: 8 },
  { x: -34, y: 16, z: 32, w: 8, h: 6, d: 8 },
  { x: -20, y: 0, z: 24, w: 7, h: 7, d: 9 },
];

/** Substation pad, main transformer tank and its cooling radiators. */
export const SUB_PAD: Box = { x: 174, y: 0, z: 6, w: 54, h: 2, d: 46 };
export const SUB_BOX: Box = { x: 186, y: 2, z: 16, w: 30, h: 20, d: 26 };
export const SUB_RADS: Box[] = [
  { x: 180, y: 2, z: 19, w: 5, h: 15, d: 20 },
  { x: 217, y: 2, z: 19, w: 5, h: 15, d: 20 },
];
/** Bushings on the transformer lid. */
export const SUB_BUSHINGS: Box[] = [
  { x: 191, y: 22, z: 24, w: 3, h: 9, d: 3 },
  { x: 199, y: 22, z: 24, w: 3, h: 11, d: 3 },
  { x: 207, y: 22, z: 24, w: 3, h: 9, d: 3 },
];

/**
 * Transmission pylon. Drawn as lines rather than boxes: a lattice tower rendered as solids at
 * this scale reads as a grey blob, and the figure draws it as a wireframe too.
 */
export const PYLON = {
  /** Base corners and apex, in world space. */
  x: 268,
  z: 24,
  baseHalf: 17,
  height: 86,
  /** Cross-arm heights and half-spans. */
  arms: [
    { y: 54, half: 26 },
    { y: 68, half: 21 },
  ],
};

/** Where the feeder trenches run, drawn flat on the ground. */
export const FEEDER_Y = 0.4;
