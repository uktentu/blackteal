/**
 * Topology layout.
 *
 * The data pack hand-places its 8 nodes and we honor those coordinates exactly. But a real
 * site with 60 skids will not arrive hand-placed, so `ensureLayout` computes a columnar
 * single-line layout whenever coordinates are absent: sources on the left, skids in wrapped
 * columns, loads on the right. Pure, and unit-tested against a synthetic 24-skid site.
 */

import type { AssetType, Topology, TopologyAsset, TopologyLink } from '../domain/types';

export const NODE_W = 164;
export const NODE_H = 50;

/** Column pitch and row pitch, sized so nodes can never overlap. */
export const COL_W = 220;
export const ROW_H = 70;
/** Skids wrap into a new column past this — a 60-skid site becomes an 8x8-ish grid. */
export const MAX_ROWS = 8;

export interface UnplacedAsset {
  id: string;
  type: AssetType;
  label: string;
  x?: number;
  y?: number;
}

export interface UnplacedTopology {
  assets: UnplacedAsset[];
  links: TopologyLink[];
}

/**
 * Return the topology with every asset placed.
 * Fully-placed input (the data pack) is returned unchanged — the brief's coordinates win.
 */
export function ensureLayout(t: UnplacedTopology): Topology {
  if (t.assets.every((a) => a.x != null && a.y != null)) return t as Topology;

  const sources = t.assets.filter((a) => a.type === 'substation');
  const skids = t.assets.filter((a) => a.type === 'skid');
  const loads = t.assets.filter((a) => a.type === 'load');

  const cols = Math.max(1, Math.ceil(skids.length / MAX_ROWS));
  const rows = Math.max(1, Math.ceil(skids.length / cols));
  const blockH = (rows - 1) * ROW_H;

  const place = (a: UnplacedAsset, x: number, y: number): TopologyAsset => ({
    id: a.id,
    type: a.type,
    label: a.label,
    x,
    y,
  });

  // Sources and loads center vertically against the skid block, like a single-line diagram.
  const centered = (n: number, i: number) => blockH / 2 - ((n - 1) * ROW_H) / 2 + i * ROW_H;

  const assets: TopologyAsset[] = [
    ...sources.map((a, i) => place(a, 40, centered(sources.length, i))),
    ...skids.map((a, i) =>
      place(a, 40 + COL_W * (Math.floor(i / rows) + 1), (i % rows) * ROW_H),
    ),
    ...loads.map((a, i) => place(a, 40 + COL_W * (cols + 1), centered(loads.length, i))),
  ];

  return { assets, links: t.links };
}

/** Bounding box of the placed topology plus padding — the diagram's fitted base view. */
export function extents(t: Topology, pad = 36) {
  const xs = t.assets.map((a) => a.x);
  const ys = t.assets.map((a) => a.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return {
    x,
    y,
    w: Math.max(...xs) + NODE_W + pad - x,
    h: Math.max(...ys) + NODE_H + pad - y,
  };
}
