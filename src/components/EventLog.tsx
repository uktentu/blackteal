/**
 * Alarm event log.
 *
 * Closes the biggest functional gap in an active-alarms-only view: an alarm that fires and
 * self-clears between two glances otherwise leaves no trace, so an operator returning from a
 * break cannot answer "what happened while I was away".
 *
 * Shown as a tab alongside the active list rather than a separate screen, because the question
 * "is this new, or has it been flapping all morning?" is asked *while* looking at the alarm.
 */

import { memo } from 'react';
import { EVENT_LABEL, type AlarmEvent } from '../sim/alarmHistory';
import { fmtClock } from './format';
import './eventlog.css';

interface Props {
  events: AlarmEvent[];
  /** When set, only this asset's events are shown. */
  assetId?: string | null;
}

export const EventLog = memo(function EventLog({ events, assetId = null }: Props) {
  if (events.length === 0) {
    return (
      <p className="console-empty">
        No alarm events recorded yet
        {assetId !== null ? ' for this asset' : ''}. Raised and cleared transitions appear here as
        they happen.
      </p>
    );
  }

  return (
    <ul className="events">
      {events.map((e) => (
        <li key={e.seq} className="event" data-kind={e.kind} data-severity={e.severity}>
          <span className="event-time metric">{fmtClock(e.at)}</span>
          <span className="event-kind">{EVENT_LABEL[e.kind]}</span>
          {assetId === null && <span className="event-asset metric">{e.assetId}</span>}
          <span className="event-code metric">{e.code}</span>
          <span className="event-msg" title={e.message}>
            {e.message}
          </span>
        </li>
      ))}
    </ul>
  );
});
