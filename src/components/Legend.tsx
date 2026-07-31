/**
 * Diagram legend.
 *
 * The brief's own Figure 1 carries one, and an operator new to the screen needs the mapping
 * once. It is also the right home for the Normal green dot: ISA-101's objection to green is
 * about colored AREA competing for attention, and here there is exactly one of each swatch
 * rather than six on the diagram at once.
 */

import { memo } from 'react';
import type { AssetState } from '../domain/types';
import { STATE_LABEL } from './format';
import './legend.css';

const STATES: AssetState[] = ['NORMAL', 'WARNING', 'FAULT', 'OFFLINE'];

export const Legend = memo(function Legend({ flowing }: { flowing: boolean }) {
  return (
    <div className="legend">
      {STATES.map((s) => (
        <span className="legend-item" key={s} data-state={s}>
          <span className="legend-mark" aria-hidden="true" />
          {STATE_LABEL[s]}
        </span>
      ))}

      <span className="legend-sep" aria-hidden="true" />

      <span className="legend-item legend-flow" data-muted={!flowing || undefined}>
        <svg width="22" height="8" aria-hidden="true">
          <path d="M1 4 H15" className="legend-flow-line" />
          <path d="M15 1.5 L20 4 L15 6.5 Z" className="legend-flow-head" />
        </svg>
        Power flow · width = magnitude
      </span>

      <span className="legend-sep" aria-hidden="true" />

      {/* Discoverability for the view controls, in the quiet tier. */}
      <span className="legend-item legend-hint">
        Scroll to zoom · drag to pan · double-click to reset
      </span>
    </div>
  );
});
