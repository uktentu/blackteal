/**
 * Layout and view-box math tests — the "works at scale" evidence.
 *
 * The app renders the data pack's 8 hand-placed assets, but the layout path is exercised
 * against synthetic 24- and 60-skid sites: every asset placed, nothing overlapping, links
 * intact, and a fitted view that still contains everything.
 */

import { describe, it, expect } from 'vitest';
import { TOPOLOGY } from '../domain/topology';
import {
  ensureLayout,
  extents,
  diagramToClient,
  NODE_W,
  NODE_H,
  MAX_ROWS,
  type UnplacedTopology,
} from './layout';

function syntheticSite(nSkids: number): UnplacedTopology {
  const skids = Array.from({ length: nSkids }, (_, i) => ({
    id: `SKID-${i + 1}`,
    type: 'skid' as const,
    label: `Power Skid ${i + 1}`,
  }));
  return {
    assets: [
      { id: 'SUBSTATION', type: 'substation', label: 'Grid / Substation' },
      ...skids,
      { id: 'LOAD', type: 'load', label: 'Data Center Load' },
    ],
    links: [
      ...skids.map((s) => ({ from: 'SUBSTATION', to: s.id })),
      ...skids.map((s) => ({ from: s.id, to: 'LOAD' })),
    ],
  };
}

describe('ensureLayout', () => {
  it('returns the data pack unchanged — the brief coordinates win', () => {
    expect(ensureLayout(TOPOLOGY)).toEqual(TOPOLOGY);
  });

  it('places every asset of a 24-skid site with no overlaps', () => {
    const placed = ensureLayout(syntheticSite(24));

    expect(placed.assets).toHaveLength(26);
    for (const a of placed.assets) {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    }

    // No two node rectangles may intersect.
    for (let i = 0; i < placed.assets.length; i++) {
      for (let j = i + 1; j < placed.assets.length; j++) {
        const a = placed.assets[i];
        const b = placed.assets[j];
        const overlap = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('wraps skids into columns instead of one endless strip', () => {
    const placed = ensureLayout(syntheticSite(24));
    const skidXs = new Set(placed.assets.filter((a) => a.type === 'skid').map((a) => a.x));
    expect(skidXs.size).toBe(Math.ceil(24 / MAX_ROWS));
  });

  it('keeps links untouched', () => {
    const site = syntheticSite(24);
    expect(ensureLayout(site).links).toEqual(site.links);
  });

  it('computes a fitted view that contains every node, at any site size', () => {
    for (const n of [6, 24, 60]) {
      const placed = ensureLayout(syntheticSite(n));
      const box = extents(placed);
      for (const a of placed.assets) {
        expect(a.x).toBeGreaterThanOrEqual(box.x);
        expect(a.y).toBeGreaterThanOrEqual(box.y);
        expect(a.x + NODE_W).toBeLessThanOrEqual(box.x + box.w);
        expect(a.y + NODE_H).toBeLessThanOrEqual(box.y + box.h);
      }
    }
  });
});

describe('fit transform', () => {
  const box = { x: 0, y: 0, w: 700, h: 470 };

  it('accounts for the letterbox when the container aspect differs', () => {
    // A 1000x800 container is taller than the 700x470 box, so `meet` letterboxes vertically.
    const scale = Math.min(1000 / box.w, 800 / box.h);
    const p = diagramToClient(box, 1000, 800, 0, 0);

    expect(p.scale).toBeCloseTo(scale, 6);
    expect(p.y).toBeCloseTo((800 - box.h * scale) / 2, 6);
    expect(p.x).toBeCloseTo(0, 6);
  });

  it('maps the box centre to the container centre', () => {
    const p = diagramToClient(box, 1000, 800, box.w / 2, box.h / 2);
    expect(p.x).toBeCloseTo(500, 6);
    expect(p.y).toBeCloseTo(400, 6);
  });
});
