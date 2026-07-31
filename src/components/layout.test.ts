/**
 * Layout and view-box math tests — the "works at scale" evidence.
 *
 * The app renders the data pack's 8 hand-placed assets, but the layout path is exercised
 * against a synthetic 24-skid site: every asset placed, nothing overlapping, links intact.
 */

import { describe, it, expect } from 'vitest';
import { TOPOLOGY } from '../domain/topology';
import { ensureLayout, extents, NODE_W, NODE_H, MAX_ROWS, type UnplacedTopology } from './layout';
import {
  zoomAt,
  pan,
  centerOn,
  contains,
  clientToDiagram,
  diagramToClient,
  zoomLevel,
  MAX_ZOOM,
  MIN_ZOOM,
  type ViewBox,
} from './viewbox';

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

describe('view-box math', () => {
  const base: ViewBox = { x: 0, y: 0, w: 700, h: 470 };

  it('zoom keeps the cursor point stationary', () => {
    const vb = zoomAt(base, base, 2, 100, 100);
    // (100,100) must map to the same relative position in the new box.
    expect((100 - vb.x) / vb.w).toBeCloseTo(100 / base.w, 6);
    expect((100 - vb.y) / vb.h).toBeCloseTo(100 / base.h, 6);
    expect(zoomLevel(vb, base)).toBeCloseTo(2, 6);
  });

  it('clamps zoom to the documented range', () => {
    let vb = base;
    for (let i = 0; i < 20; i++) vb = zoomAt(vb, base, 1.5, 350, 235);
    expect(zoomLevel(vb, base)).toBeCloseTo(MAX_ZOOM, 6);

    for (let i = 0; i < 30; i++) vb = zoomAt(vb, base, 1 / 1.5, 350, 235);
    expect(zoomLevel(vb, base)).toBeCloseTo(MIN_ZOOM, 6);
  });

  it('never lets the diagram be panned fully out of frame', () => {
    let vb = base;
    for (let i = 0; i < 100; i++) vb = pan(vb, base, 500, 500);
    // At least 20% of the view still overlaps the base extents.
    expect(vb.x).toBeLessThanOrEqual(base.x + base.w - vb.w * 0.2);
    expect(vb.y).toBeLessThanOrEqual(base.y + base.h - vb.h * 0.2);
  });

  it('centerOn puts the target in the middle of the view', () => {
    const zoomed = zoomAt(base, base, 2, 350, 235);
    const vb = centerOn(zoomed, base, 500, 300);
    expect(vb.x + vb.w / 2).toBeCloseTo(500, 6);
    expect(vb.y + vb.h / 2).toBeCloseTo(300, 6);
    expect(contains(vb, 500, 300, 10)).toBe(true);
  });

  it('round-trips client and diagram coordinates through the letterbox', () => {
    // Element aspect (1000x800) differs from view-box aspect, so `meet` letterboxes.
    const p = clientToDiagram(base, 1000, 800, 640, 400);
    const back = diagramToClient(base, 1000, 800, p.x, p.y);
    expect(back.x).toBeCloseTo(640, 6);
    expect(back.y).toBeCloseTo(400, 6);
  });
});
