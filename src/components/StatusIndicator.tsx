/**
 * Status indicator — the one component that renders asset state.
 *
 * Three redundant channels, always, because the brief says not to rely on color alone:
 *   COLOR  the token
 *   FORM   filled dot (fault) / hollow ring (warning) / open tick (normal) / dashed (offline)
 *   TEXT   the state label
 *
 * Only FAULT animates. Warning and normal are static by design: motion is reserved for the
 * one thing that should pull an operator's eye across the room.
 */

import { memo } from 'react';
import type { AssetState } from '../domain/types';
import { STATE_LABEL } from './format';
import './status.css';

interface Props {
  state: AssetState;
  /** Hide the text label only where an adjacent element already carries it. */
  showLabel?: boolean;
  size?: number;
}

export const StatusIndicator = memo(function StatusIndicator({
  state,
  showLabel = true,
  size = 8,
}: Props) {
  return (
    <span className="status" data-state={state}>
      <span
        className="status-mark"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      {showLabel && <span className="status-label">{STATE_LABEL[state]}</span>}
      {/* Always in the accessibility tree, even when the visible label is suppressed. */}
      {!showLabel && <span className="sr-only">{STATE_LABEL[state]}</span>}
    </span>
  );
});
