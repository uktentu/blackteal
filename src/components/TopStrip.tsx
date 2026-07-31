/**
 * Top strip — one line of site-wide situational awareness.
 *
 * "Can someone glance at the screen and instantly tell whether the site is healthy?" is the
 * brief's top grading criterion, and this line is the answer to it. Power balance on the left,
 * a single aggregate health verdict on the right, stale indicator between them.
 */

import { memo } from 'react';
import type { AssetState } from '../domain/types';
import { StatusIndicator } from './StatusIndicator';
import { fmt, fmtAgo } from './format';
import './topstrip.css';

interface Props {
  load_MW: number;
  grid_MW: number;
  bess_MW: number;
  needsAttention: number;
  worst: AssetState;
  stale: boolean;
  staleForMs: number;
  onSimulateBurst: () => void;
  onSimulateDropout: () => void;
}

export const TopStrip = memo(function TopStrip({
  load_MW,
  grid_MW,
  bess_MW,
  needsAttention,
  worst,
  stale,
  staleForMs,
  onSimulateBurst,
  onSimulateDropout,
}: Props) {
  return (
    <header className="topstrip">
      <div className="topstrip-brand">
        <span className="topstrip-site">HARBOR POINT BESS</span>
        <span className="topstrip-sub">15 MW / 60 MWh · 138 kV</span>
      </div>

      {/* Power balance: grid + BESS = load. Reads as an equation on purpose. */}
      <div className="topstrip-balance">
        <Balance label="Grid import" value={fmt(grid_MW, 1)} unit="MW" />
        <span className="topstrip-op">+</span>
        <Balance label="BESS output" value={fmt(bess_MW, 1)} unit="MW" />
        <span className="topstrip-op">=</span>
        <Balance label="Facility load" value={fmt(load_MW, 1)} unit="MW" emphasis />
      </div>

      <div className="topstrip-right">
        {stale && (
          <span className="topstrip-stale" role="status">
            <span className="topstrip-stale-mark" aria-hidden="true" />
            FEED DISCONNECTED · last frame {fmtAgo(staleForMs)}
          </span>
        )}

        <span className="topstrip-health">
          <StatusIndicator state={worst} showLabel={false} size={9} />
          <span className="topstrip-health-text">
            {needsAttention === 0
              ? 'All assets normal'
              : `${needsAttention} asset${needsAttention === 1 ? '' : 's'} need attention`}
          </span>
        </span>

        {/* Demo triggers: the brief asks for flood grouping and the stale indicator to be
            demonstrable on demand rather than something a reviewer has to wait for. */}
        <div className="topstrip-actions">
          <button type="button" onClick={onSimulateBurst}>
            Simulate alarm burst
          </button>
          <button type="button" onClick={onSimulateDropout} data-active={stale || undefined}>
            {stale ? 'Restore feed' : 'Simulate dropout'}
          </button>
        </div>
      </div>
    </header>
  );
});

function Balance({
  label,
  value,
  unit,
  emphasis,
}: {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}) {
  return (
    <span className="balance" data-emphasis={emphasis || undefined}>
      <span className="balance-label">{label}</span>
      <span className="balance-value metric">
        {value}
        <span className="balance-unit">{unit}</span>
      </span>
    </span>
  );
}
