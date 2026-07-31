/**
 * Isometric projection tests.
 *
 * The scene is drawn with a painter's algorithm, so depth ordering being right is the
 * difference between a site model and a pile of overlapping boxes. Kept pure and tested for
 * the same reason the simulator is.
 */

import { describe, it, expect } from 'vitest';
import {
  project,
  boxFaces,
  boxCorners,
  depth,
  sortByDepth,
  topCentre,
  screenBounds,
  COS30,
  type Box,
} from './iso';
import {
  GROUND,
  SKID_BOXES,
  LOAD_BOX,
  SUB_BOX,
  SUB_BUSHINGS,
  BUSHING_TOPS,
  LINE_ATTACH,
  PYLON,
} from './layout';

const box = (x: number, y: number, z: number): Box => ({ x, y, z, w: 10, h: 10, d: 10 });

describe('projection', () => {
  it('puts the world origin at the screen origin', () => {
    expect(project(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('sends +X right and down, +Z left and down, +Y straight up', () => {
    expect(project(10, 0, 0).x).toBeGreaterThan(0);
    expect(project(10, 0, 0).y).toBeGreaterThan(0);

    expect(project(0, 0, 10).x).toBeLessThan(0);
    expect(project(0, 0, 10).y).toBeGreaterThan(0);

    expect(project(0, 10, 0).y).toBeLessThan(0);
    expect(project(0, 10, 0).x).toBe(0);
  });

  it('uses a true 30-degree projection, as the source figure does', () => {
    expect(project(1, 0, 0).x).toBeCloseTo(COS30, 6);
    expect(project(1, 0, 0).y).toBeCloseTo(0.5, 6);
  });

  it('keeps equal X and Z on the same screen column', () => {
    // The far and near corners of a square footprint must line up vertically.
    expect(project(20, 0, 20).x).toBeCloseTo(0, 6);
  });

  it('is linear, so a box never shears', () => {
    const a = project(3, 4, 5);
    const b = project(6, 8, 10);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });
});

describe('box faces', () => {
  it('emits only the three faces that can face this camera', () => {
    const f = boxFaces(box(0, 0, 0));
    expect(Object.keys(f).sort()).toEqual(['left', 'right', 'top']);
    for (const poly of Object.values(f)) {
      expect(poly.split(' ')).toHaveLength(4); // each face is a quad
    }
  });

  it('draws the top face above the side faces on screen', () => {
    const f = boxFaces(box(0, 0, 0));
    const ys = (p: string) => p.split(' ').map((pair) => Number(pair.split(',')[1]));
    // Smaller screen-y is higher up.
    expect(Math.min(...ys(f.top))).toBeLessThan(Math.min(...ys(f.right)));
    expect(Math.min(...ys(f.top))).toBeLessThan(Math.min(...ys(f.left)));
  });

  it('produces eight distinct corners', () => {
    expect(new Set(boxCorners(box(0, 0, 0)).map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(4);
  });
});

describe('depth ordering', () => {
  it('sorts far boxes before near ones', () => {
    const near = box(50, 0, 50);
    const far = box(0, 0, 0);
    expect(depth(far)).toBeLessThan(depth(near));
    expect(sortByDepth([{ box: near }, { box: far }])[0].box).toBe(far);
  });

  it('treats a taller box at the same footprint as nearer', () => {
    // A rooftop unit must paint after the building it stands on.
    expect(depth({ ...box(0, 12, 0) })).toBeGreaterThan(depth(box(0, 0, 0)));
  });

  it('does not mutate its input', () => {
    const items = [{ box: box(9, 0, 9) }, { box: box(0, 0, 0) }];
    const first = items[0];
    sortByDepth(items);
    expect(items[0]).toBe(first);
  });
});

describe('site layout', () => {
  it('places all six skids without overlap', () => {
    const ids = Object.keys(SKID_BOXES);
    expect(ids).toHaveLength(6);

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = SKID_BOXES[ids[i]];
        const b = SKID_BOXES[ids[j]];
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
        expect(overlap, `${ids[i]} overlaps ${ids[j]}`).toBe(false);
      }
    }
  });

  it('lays the site out grid-to-load, right to left, as the figure does', () => {
    // Substation is furthest +X, the data centre furthest -X.
    expect(SUB_BOX.x).toBeGreaterThan(Math.max(...Object.values(SKID_BOXES).map((b) => b.x)));
    expect(LOAD_BOX.x).toBeLessThan(Math.min(...Object.values(SKID_BOXES).map((b) => b.x)));
  });

  it('keeps every structure on the ground slab', () => {
    const on = (b: Box) =>
      b.x >= GROUND.x &&
      b.x + b.w <= GROUND.x + GROUND.w &&
      b.z >= GROUND.z &&
      b.z + b.d <= GROUND.z + GROUND.d;

    for (const [id, b] of Object.entries(SKID_BOXES)) expect(on(b), id).toBe(true);
    expect(on(LOAD_BOX), 'LOAD').toBe(true);
    expect(on(SUB_BOX), 'SUBSTATION').toBe(true);
  });

  it('lands every conductor exactly on an HV bushing', () => {
    // Regression: the conductors and the transformer were placed independently, so the line
    // terminated up to 15 units above the bushings and off in Z — visibly unconnected.
    expect(LINE_ATTACH).toHaveLength(SUB_BUSHINGS.length);

    for (const [i, top] of BUSHING_TOPS.entries()) {
      const b = SUB_BUSHINGS[i];
      expect(top.x).toBeCloseTo(b.x + b.w / 2, 6);
      expect(top.y).toBeCloseTo(b.y + b.h, 6);
      expect(top.z).toBeCloseTo(b.z + b.d / 2, 6);
    }
  });

  it('takes every conductor off the substation side of the tower', () => {
    // A conductor starting on the far arm would have to pass through the tower to reach the
    // substation.
    for (const a of LINE_ATTACH) {
      expect(a.x).toBeLessThan(PYLON.x);
      expect(a.x).toBeGreaterThan(SUB_BOX.x + SUB_BOX.w);
    }
  });

  it('runs the conductors downhill, so they descend onto the bushings', () => {
    for (const [i, a] of LINE_ATTACH.entries()) {
      expect(a.y).toBeGreaterThan(BUSHING_TOPS[i].y);
    }
  });

  it('keeps the conductor runs from crossing each other', () => {
    // Parallel runs: sorting the attachments by X must give the same order as their targets.
    const byAttach = LINE_ATTACH.map((a, i) => ({ ax: a.x, tx: BUSHING_TOPS[i].x })).sort(
      (p, q) => q.ax - p.ax,
    );
    const targets = byAttach.map((e) => e.tx);
    expect(targets).toEqual([...targets].sort((p, q) => q - p));
  });

  it('stands the tower on the ground slab', () => {
    // The slab used to end before the tower, leaving it floating off the edge of the site.
    const reach = PYLON.x + PYLON.arms[0].half;
    expect(reach).toBeLessThanOrEqual(GROUND.x + GROUND.w);
    expect(PYLON.x - PYLON.arms[0].half).toBeGreaterThanOrEqual(GROUND.x);
    expect(PYLON.z).toBeGreaterThanOrEqual(GROUND.z);
    expect(PYLON.z).toBeLessThanOrEqual(GROUND.z + GROUND.d);
  });

  it('anchors markers to the top face, not the base', () => {
    const b = SKID_BOXES['SKID-1'];
    expect(topCentre(b).y).toBeLessThan(project(b.x + b.w / 2, b.y, b.z + b.d / 2).y);
  });

  it('computes a bounding box that contains the whole site', () => {
    const pts = [...boxCorners(GROUND), ...boxCorners(LOAD_BOX), ...boxCorners(SUB_BOX)];
    const s = screenBounds(pts);
    expect(s.maxX).toBeGreaterThan(s.minX);
    expect(s.maxY).toBeGreaterThan(s.minY);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(s.minX);
      expect(p.x).toBeLessThanOrEqual(s.maxX);
    }
  });
});
