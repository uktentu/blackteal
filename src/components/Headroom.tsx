/**
 * Stage 3 — battery headroom against the operating envelope.
 *
 * The brief asks for the margin AND why it's derated. A bar showing "1500 of 2500 kW" is
 * only half an answer; an operator's next question is always "why can't it do 2500?", so the
 * reason is rendered inline rather than left in the alarm list.
 *
 * Three nested magnitudes on one track:
 *   nameplate  ...... the full 2500 kW the hardware can do
 *   envelope   ...... what the battery will safely allow right now
 *   output     ...... what it is actually delivering
 */

import { memo } from 'react';
import './headroom.css';

interface Props {
  nameplate_kW: number;
  envelope_kW: number;
  output_kW: number;
  derate_kW: number;
  headroom_kW: number;
  /** The rule that caused the derate — Stage 4's explanation, reused here. */
  reason: string | null;
}

const MW = (kW: number) => (kW / 1000).toFixed(2);

export const Headroom = memo(function Headroom({
  nameplate_kW,
  envelope_kW,
  output_kW,
  derate_kW,
  headroom_kW,
  reason,
}: Props) {
  const envelopePct = (envelope_kW / nameplate_kW) * 100;
  const outputPct = (output_kW / nameplate_kW) * 100;
  const derated = derate_kW > 0;

  return (
    <div className="headroom">
      <div
        className="headroom-track"
        role="img"
        aria-label={`Delivering ${MW(output_kW)} MW of an allowed ${MW(envelope_kW)} MW, against a ${MW(nameplate_kW)} MW nameplate`}
      >
        {/* Derated band: the part of the nameplate that is currently unavailable. */}
        {derated && (
          <span
            className="headroom-derated"
            style={{ left: `${envelopePct}%`, width: `${100 - envelopePct}%` }}
          />
        )}
        {/* Envelope: what the battery will allow right now. */}
        <span className="headroom-envelope" style={{ width: `${envelopePct}%` }} />
        {/* Actual output. */}
        <span className="headroom-output" style={{ width: `${outputPct}%` }} />
        {/* Nameplate tick, so the missing capacity is legible as a distance. */}
        <span className="headroom-tick" style={{ left: `${envelopePct}%` }} />
      </div>

      <dl className="headroom-legend">
        <Item label="Delivering" value={MW(output_kW)} tone="output" />
        <Item label="Allowed now" value={MW(envelope_kW)} tone={derated ? 'warning' : 'envelope'} />
        <Item label="Margin left" value={MW(headroom_kW)} tone="muted" />
        {derated && <Item label="Unavailable" value={MW(derate_kW)} tone="warning" />}
      </dl>

      {reason !== null && <p className="headroom-reason">{reason}</p>}
    </div>
  );
});

function Item({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="headroom-item" data-tone={tone}>
      <dt>{label}</dt>
      <dd className="metric">
        {value}
        <span className="headroom-unit">MW</span>
      </dd>
    </div>
  );
}
