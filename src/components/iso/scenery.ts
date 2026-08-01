/**
 * Site context — continuous terrain around the plant.
 *
 * Modelled on how a real BESS site looks from the air: one unbroken ground surface with organic
 * variation, a solar array running to the horizon, service tracks, and the compound sitting in
 * the middle of it. Deliberately NOT a grid of tiles — a tiled ground reads as wallpaper pasted
 * behind the model rather than as land the plant stands on.
 *
 * Everything here is scenery: non-interactive, aria-hidden, and locked to the neutral tier.
 * The terrain runs well past the view box on every side, so the site has no visible edge and
 * reads as continuing beyond the frame.
 */

import type { Box } from './iso';

/**
 * Screen-aligned placement. `u` is the screen-horizontal axis and `v` the screen-vertical,
 * which lets the layout be written the way it is seen. Objects placed with it are still
 * world-aligned, so they project to diamonds and lie flat on the ground plane.
 */
export const fromScreen = (u: number, v: number) => ({ x: (u + v) / 2, z: (v - u) / 2 });

/** The plant's footprint. Scenery is kept off it. */
export const COMPOUND: Box = { x: -110, y: 0, z: -30, w: 440, h: 1, d: 110 };

/**
 * Terrain extents, far larger than the view.
 *
 * The view box is fitted to the plant, not to the land, so the ground bleeds off all four
 * edges. That is what makes the site feel like part of somewhere, rather than a model sitting
 * on a tray.
 */
export const LAND_U = { min: -4000, max: 4200 };
export const LAND_V = { min: -3000, max: 3400 };

export const LAND_CORNERS = [
  fromScreen(LAND_U.min, LAND_V.min),
  fromScreen(LAND_U.max, LAND_V.min),
  fromScreen(LAND_U.max, LAND_V.max),
  fromScreen(LAND_U.min, LAND_V.max),
];

function plot(u: number, v: number, w: number, d: number, y = 0, h = 0): Box {
  const c = fromScreen(u, v);
  return { x: c.x - w / 2, y, z: c.z - d / 2, w, h, d };
}

function intersects(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.w + margin &&
    b.x - margin < a.x + a.w &&
    a.z < b.z + b.d + margin &&
    b.z - margin < a.z + a.d
  );
}

/** Deterministic hash noise: the landscape must be identical on every load. */
function rand(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// Terrain variation
// ---------------------------------------------------------------------------

export interface Meadow {
  /** Screen-space polygon, irregular so no edge reads as a tile boundary. */
  points: { u: number; v: number }[];
  tone: 1 | 2 | 3;
}

/**
 * Broad regions of slightly different ground tone.
 *
 * Irregular polygons rather than a grid: the whole point is that no boundary looks
 * manufactured. Tones sit within a few percent of one another, so they read as grass and crop
 * variation rather than as separate objects laid on top.
 */
export const MEADOWS: Meadow[] = [
  {
    tone: 1,
    points: [
      { u: -2600, v: -600 },
      { u: -420, v: -500 },
      { u: -180, v: -180 },
      { u: -520, v: 240 },
      { u: -1100, v: 420 },
      { u: -2600, v: 300 },
    ],
  },
  {
    tone: 2,
    points: [
      { u: -2400, v: 400 },
      { u: -430, v: 200 },
      { u: -120, v: 470 },
      { u: -360, v: 900 },
      { u: -2400, v: 1400 },
    ],
  },
  {
    tone: 3,
    points: [
      { u: -180, v: 430 },
      { u: 420, v: 330 },
      { u: 1800, v: 700 },
      { u: 1600, v: 1500 },
      { u: -400, v: 1500 },
    ],
  },
  {
    tone: 2,
    points: [
      { u: 340, v: -820 },
      { u: 2600, v: -900 },
      { u: 2700, v: -60 },
      { u: 900, v: 60 },
      { u: 420, v: -300 },
    ],
  },
  {
    tone: 1,
    points: [
      { u: -300, v: -880 },
      { u: 420, v: -900 },
      { u: 500, v: -420 },
      { u: -120, v: -300 },
      { u: -420, v: -560 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Ground texture
// ---------------------------------------------------------------------------

export interface Tuft {
  x: number;
  z: number;
  /** Length of the mark, in world units. */
  len: number;
}

/**
 * Scattered grass marks — what actually sells continuous ground.
 *
 * A field of small strokes at varying density with no repeating structure. Thinned with
 * distance from the compound, so detail concentrates where the eye already is.
 */
export const TUFTS: Tuft[] = (() => {
  const out: Tuft[] = [];
  // Scattered around the compound rather than across the whole land: the terrain is far
  // larger than the frame, and spreading a fixed budget over all of it would leave the
  // visible area bare.
  for (let i = 0; i < 900; i++) {
    const u = 90 + (rand(i, 1) - 0.5) * 1500;
    const v = 140 + (rand(i, 2) - 0.5) * 900;

    // A tight detail band near the plant only. Spread wide it reads as noise, not ground.
    const d = Math.hypot(u - 90, (v - 140) * 1.7);
    if (d > 620 || rand(i, 3) > 0.5) continue;

    const p = fromScreen(u, v);
    if (intersects({ x: p.x - 3, y: 0, z: p.z - 3, w: 6, h: 0, d: 6 }, COMPOUND, 8)) continue;

    out.push({ x: p.x, z: p.z, len: 2.6 + rand(i, 4) * 4 });
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Solar array — running to the horizon, as on a real co-located site
// ---------------------------------------------------------------------------

export const PANEL = { depth: 12, height: 8 };

/**
 * A large block of tracker rows on the substation side.
 *
 * Deliberately extends past the view edge: an array that stops neatly inside the frame looks
 * like a prop, and real co-located farms run to the horizon.
 */
export const SOLAR_ROWS: Box[] = (() => {
  const out: Box[] = [];
  for (let col = 0; col < 16; col++) {
    for (let row = 0; row < 18; row++) {
      const b = plot(400 + col * 74, -560 + row * 46, 62, PANEL.depth);
      if (intersects(b, COMPOUND, 24)) continue;
      out.push(b);
    }
  }
  return out;
})();

/** A second array further out, catching the far edge of the frame. */
export const SOLAR_FAR: Box[] = (() => {
  const out: Box[] = [];
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 10; row++) {
      out.push(plot(-1400 + col * 72, -820 + row * 44, 58, PANEL.depth));
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Service tracks
// ---------------------------------------------------------------------------

export interface Track {
  points: { u: number; v: number }[];
  halfWidth: number;
}

/** Dirt access tracks, angled across the site the way a service road actually runs. */
export const TRACKS: Track[] = [
  {
    halfWidth: 9,
    points: [
      { u: -2800, v: 420 },
      { u: -520, v: 268 },
      { u: -180, v: 226 },
      { u: 300, v: 258 },
      { u: 900, v: 390 },
      { u: 2800, v: 700 },
    ],
  },
  {
    halfWidth: 5,
    points: [
      { u: 300, v: -1600 },
      { u: 350, v: -420 },
      { u: 380, v: -60 },
      { u: 400, v: 240 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Village
// ---------------------------------------------------------------------------

export interface House {
  box: Box;
  roof: number;
}

const HOUSE_SPEC: [u: number, v: number, w: number, d: number, h: number, roof: number][] = [
  [-760, 500, 30, 24, 16, 12],
  [-700, 540, 24, 20, 13, 10],
  [-716, 454, 26, 22, 15, 11],
  [-640, 506, 30, 24, 17, 13],
  [-648, 576, 24, 20, 13, 10],
  [-576, 542, 26, 22, 15, 11],
  [-580, 470, 22, 18, 12, 9],
  [-512, 570, 28, 22, 16, 12],
  [-512, 482, 24, 20, 14, 10],
];

export const HOUSES: House[] = HOUSE_SPEC.map(([u, v, w, d, h, roof]) => ({
  box: plot(u, v, w, d, 0, h),
  roof,
}));

// ---------------------------------------------------------------------------
// Turbines and trees
// ---------------------------------------------------------------------------

export const TURBINES = [
  { ...fromScreen(-300, -620), h: 96, r: 30 },
  { ...fromScreen(-90, -700), h: 112, r: 36 },
  { ...fromScreen(140, -640), h: 88, r: 27 },
  { ...fromScreen(-500, -540), h: 80, r: 25 },
];

export interface Tree {
  x: number;
  z: number;
  r: number;
}

/** Hedgerows following the main track, plus loose clusters near the village. */
export const TREES: Tree[] = (() => {
  const out: Tree[] = [];
  const main = TRACKS[0].points;

  for (let i = 0; i < 26; i++) {
    const t = (i / 25) * (main.length - 1);
    const k = Math.min(main.length - 2, Math.floor(t));
    const f = t - k;
    const u = main[k].u + (main[k + 1].u - main[k].u) * f + rand(i, 7) * 26;
    const v = main[k].v + (main[k + 1].v - main[k].v) * f + (i % 2 === 0 ? -34 : 38);
    const p = fromScreen(u, v);
    if (intersects({ x: p.x - 8, y: 0, z: p.z - 8, w: 16, h: 0, d: 16 }, COMPOUND, 24)) continue;
    out.push({ x: p.x, z: p.z, r: 6.5 + rand(i, 9) * 4 });
  }

  for (let i = 0; i < 10; i++) {
    const p = fromScreen(-1150 + rand(i, 11) * 700, 540 + rand(i, 12) * 420);
    out.push({ x: p.x, z: p.z, r: 6 + rand(i, 13) * 4.5 });
  }
  return out;
})();

/** Compound boundary fence, in screen-aligned units. */
export const FENCE = { u: -230, v: -60, du: 580, dv: 280 };
