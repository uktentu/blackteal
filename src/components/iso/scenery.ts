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

/**
 * The window the camera can actually see, measured from the rendered view box.
 *
 * Scenery placed outside this is simply invisible, which is how an earlier pass ended up with
 * a village, three barns and four silos that nobody could ever see. Every placement below is
 * expressed against these bounds, with a deliberate overspill so structures are cut by the
 * frame rather than stopping neatly inside it.
 */
export const VIEW_U = { min: -529, max: 689 };
export const VIEW_V = { min: -266, max: 437 };

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

/**
 * Place by world coordinates rather than screen position.
 *
 * "Next to the data centre" is a relationship in world space — a neighbouring hall shares its
 * z band and sits a little further along x. Expressed in screen coordinates that becomes a
 * diagonal offset that is easy to get wrong, and my first attempt put the campus halls off at
 * the frame edge instead of alongside the building they belong to.
 */
function plotWorld(x: number, z: number, w: number, d: number, h = 0): Box {
  return { x, y: 0, z, w, h, d };
}

/**
 * Everything already standing, so later placements can avoid it.
 *
 * Buildings were previously hand-listed by coordinate and only checked against the compound.
 * The result was a hall on the plant itself, one hall inside a barn, two buildings in the
 * middle of the solar array and three straddling the access road. Placement now rejects
 * against every prior claim, and the tests assert it stays that way.
 */
const CLAIMED: Box[] = [];

function intersects(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.w + margin &&
    b.x - margin < a.x + a.w &&
    a.z < b.z + b.d + margin &&
    b.z - margin < a.z + a.d
  );
}

/** True when a footprint straddles a track centreline. */
function onTrack(b: Box, pad = 10): boolean {
  for (const t of TRACK_SPEC) {
    for (let k = 0; k < t.length - 1; k++) {
      for (let s = 0; s <= 1; s += 0.04) {
        const u = t[k].u + (t[k + 1].u - t[k].u) * s;
        const v = t[k].v + (t[k + 1].v - t[k].v) * s;
        const p = fromScreen(u, v);
        if (
          p.x >= b.x - pad &&
          p.x <= b.x + b.w + pad &&
          p.z >= b.z - pad &&
          p.z <= b.z + b.d + pad
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Claim a footprint, or return null if it collides with anything already standing.
 * Callers skip what they cannot place rather than overlapping it.
 */
function claim(b: Box, margin = 12): Box | null {
  if (intersects(b, COMPOUND, 26)) return null;
  if (onTrack(b)) return null;
  if (CLAIMED.some((c) => intersects(b, c, margin))) return null;
  CLAIMED.push(b);
  return b;
}

/** Deterministic hash noise: the landscape must be identical on every load. */
function rand(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Dirt access tracks, angled across the site the way a service road actually runs. */
const TRACK_SPEC: { u: number; v: number }[][] = [
  [
    { u: -2800, v: 420 },
    { u: -520, v: 268 },
    { u: -180, v: 226 },
    { u: 300, v: 258 },
    { u: 900, v: 390 },
    { u: 2800, v: 700 },
  ],
  [
    { u: 300, v: -1600 },
    { u: 350, v: -420 },
    { u: 380, v: -60 },
    { u: 400, v: 240 },
  ],
];

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
    const u = 80 + (rand(i, 1) - 0.5) * 1400;
    const v = 90 + (rand(i, 2) - 0.5) * 820;

    // A detail band across the visible ground. Spread wider it reads as noise, not terrain.
    const d = Math.hypot(u - 80, (v - 90) * 1.6);
    if (d > 660 || rand(i, 3) > 0.55) continue;

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
  for (let col = 0; col < 10; col++) {
    for (let row = 0; row < 12; row++) {
      const b = plot(390 + col * 74, -300 + row * 46, 62, PANEL.depth);
      if (intersects(b, COMPOUND, 24) || onTrack(b, 6)) continue;
      CLAIMED.push(b);
      out.push(b);
    }
  }
  return out;
})();

/**
 * A second array, set well back on the far side.
 *
 * Moved clear of the near campus: at its previous position it sat almost entirely above the
 * visible window while still claiming the ground the adjacent halls needed — so it was
 * silently blocking buildings nobody could see it blocking.
 */
export const SOLAR_FAR: Box[] = (() => {
  const out: Box[] = [];
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 4; row++) {
      const b = plot(300 + col * 70, -560 + row * 42, 56, PANEL.depth);
      if (intersects(b, COMPOUND, 24) || onTrack(b, 6)) continue;
      CLAIMED.push(b);
      out.push(b);
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

export const TRACKS: Track[] = TRACK_SPEC.map((points, i) => ({
  points,
  halfWidth: i === 0 ? 9 : 5,
}));

export interface Hall {
  box: Box;
  /** Rooftop plant units. */
  plant: Box[];
}

/**
 * Halls immediately beside the data centre.
 *
 * A ~38 MW facility is one building of a campus, not a lone shed. These sit close enough to
 * read as the same site as the main hall, and are rendered a tier brighter than the outlying
 * halls so the scene has depth: plant, then near campus, then distant context.
 */
/**
 * World-space positions, alongside the data-centre hall at x -98..-34, z -4..48.
 *
 * Sized close to the main building so they read as sibling halls on one campus rather than as
 * outbuildings, and set just clear of the compound edge so they sit next to the plant without
 * standing on it.
 */
const NEAR_HALL_SPEC: [x: number, z: number, w: number, d: number, h: number][] = [
  // Directly alongside the main hall, sharing its depth band and as close as the compound
  // edge allows — a campus row, not distant neighbours.
  [-200, -8, 60, 52, 33],
  [-200, 64, 60, 46, 29],
  // One set back and one forward, so the group reads as a campus rather than a wall.
  [-290, -108, 62, 48, 31],
  [-290, 126, 62, 48, 30],
  [-300, 10, 56, 44, 27],
];

export const NEAR_HALLS: Hall[] = NEAR_HALL_SPEC.flatMap(([x, z, w, d, h]) => {
  const box = claim(plotWorld(x, z, w, d, h), 16);
  if (box === null) return [];
  const plant: Box[] = [];
  for (let i = 0; i < 3; i++) {
    plant.push({
      x: box.x + 8 + i * ((box.w - 16) / 3),
      y: h,
      z: box.z + box.d * 0.32,
      w: 8,
      h: 4,
      d: 8,
    });
  }
  return [{ box, plant }];
});


/**
 * Other halls on the campus.
 *
 * A 38 MW facility is rarely alone — sites like this are campuses, and neighbouring halls are
 * what give the plant its sense of scale. Deliberately muted and detail-light: they read as
 * buildings at a distance, and nothing about them should invite a click.
 */
const HALL_SPEC: [u: number, v: number, w: number, d: number, h: number][] = [
  // Left flank, set back beyond the near campus.
  [-500, -210, 90, 60, 30],
  [-520, 96, 82, 56, 28],
  [-470, 232, 78, 54, 26],
  // Bottom-right, balancing the solar block.
  [560, 330, 88, 60, 29],
  [664, 176, 76, 52, 26],
  [432, 414, 80, 56, 27],
  // Cut by the frame, so the campus reads as continuing past it.
  [700, -170, 82, 56, 27],
  [-560, 380, 84, 56, 27],
];

export const HALLS: Hall[] = HALL_SPEC.flatMap(([u, v, w, d, h]) => {
  const box = claim(plot(u, v, w, d, 0, h), 22);
  if (box === null) return [];
  const plant: Box[] = [];
  // Rooftop chillers in a neat row, as on the real thing.
  for (let i = 0; i < 4; i++) {
    plant.push({
      x: box.x + 8 + i * ((box.w - 16) / 4),
      y: h,
      z: box.z + box.d * 0.3,
      w: 9,
      h: 4,
      d: 9,
    });
  }
  return [{ box, plant }];
});

// ---------------------------------------------------------------------------
// Village
// ---------------------------------------------------------------------------

export interface House {
  box: Box;
  roof: number;
}

const HOUSE_SPEC: [u: number, v: number, w: number, d: number, h: number, roof: number][] = [
  [-476, 296, 28, 22, 15, 11],
  [-420, 336, 22, 20, 13, 10],
  [-440, 254, 24, 20, 14, 10],
  [-356, 300, 30, 24, 16, 12],
  [-292, 264, 20, 18, 12, 9],
  [-286, 342, 26, 22, 15, 11],
  [-222, 300, 24, 20, 14, 10],
  [-216, 378, 28, 22, 16, 12],
  [-150, 336, 22, 18, 12, 9],
  [-146, 412, 24, 20, 13, 10],
];

export const HOUSES: House[] = HOUSE_SPEC.flatMap(([u, v, w, d, h, roof]) => {
  const box = claim(plot(u, v, w, d, 0, h), 10);
  return box === null ? [] : [{ box, roof }];
});

// ---------------------------------------------------------------------------
// Turbines and trees
// ---------------------------------------------------------------------------

export const TURBINES = [
  { ...fromScreen(-140, -250), h: 88, r: 28 },
  { ...fromScreen(60, -290), h: 102, r: 33 },
  { ...fromScreen(250, -255), h: 80, r: 25 },
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

// ---------------------------------------------------------------------------
// Neighbouring data-centre campus
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Farm structures
// ---------------------------------------------------------------------------

export interface Silo {
  x: number;
  z: number;
  r: number;
  h: number;
}

/** Grain silos beside the village — vertical accents in an otherwise flat middle distance. */
export const SILOS: Silo[] = (
  [
    [-462, 402, 9, 32],
    [-436, 424, 9, 28],
    [-410, 402, 8, 24],
    [110, 406, 9, 30],
    [138, 428, 8, 26],
  ] as [number, number, number, number][]
).flatMap(([u, v, r, h]) => {
  const c = fromScreen(u, v);
  const box = claim({ x: c.x - r, y: 0, z: c.z - r, w: r * 2, h: 0, d: r * 2 }, 6);
  return box === null ? [] : [{ x: c.x, z: c.z, r, h }];
});

/** Barns: bigger pitched-roof sheds, distinct from the houses. */
export const BARNS: House[] = (
  [
    // Only positions verified clear of the village, silos, solar and the access track.
    // The ground is genuinely full at this point, which is why there are two and not five.
    [66, 350, 44, 28, 14, 12],
    [-590, 170, 46, 30, 15, 13],
  ] as [number, number, number, number, number, number][]
).flatMap(([u, v, w, d, h, roof]) => {
  const box = claim(plot(u, v, w, d, 0, h), 14);
  return box === null ? [] : [{ box, roof }];
});
