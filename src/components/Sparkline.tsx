/**
 * Stage 3 — sparkline of a metric's recent history.
 *
 * Deliberately unlabelled and axis-free: this answers "is it steady, climbing, or falling?"
 * at a glance. The exact number is already on the row above it, and adding axes here would
 * spend screen and attention on information that is a centimetre away.
 */

import { memo } from 'react';
import './sparkline.css';

interface Props {
  values: number[];
  /** Renders the trace in the warning tone when the metric is in an abnormal band. */
  tone?: 'normal' | 'warning' | 'fault';
  width?: number;
  height?: number;
}

export const Sparkline = memo(function Sparkline({
  values,
  tone = 'normal',
  width = 312,
  height = 34,
}: Props) {
  if (values.length < 2) {
    return <div className="spark-empty">Collecting history…</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; render it as a centred line instead.
  const span = max - min || 1;
  const pad = 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${d} L${points[points.length - 1][0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      className="spark"
      data-tone={tone}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`Recent trend: ${min.toFixed(2)} to ${max.toFixed(2)}, latest ${values[values.length - 1].toFixed(2)}`}
    >
      <path className="spark-area" d={area} />
      <path className="spark-line" d={d} />
      {/* Head marker: without it the eye has to hunt for "now" on the trace. */}
      <circle className="spark-head" cx={lastX} cy={lastY} r={2} />
    </svg>
  );
});
