/**
 * Alarm console — Stage 1.
 *
 * "Real operators can act on only ~6-12 alarms/hour, so surfacing the one that matters — and
 * not burying it — is the whole job." Everything here serves that: priority sort, ack, shelve,
 * filters, and flood grouping.
 *
 * Docked, collapsible, and resizable by dragging its top edge. The severity-count header stays
 * visible when collapsed, because the counts are the part an operator needs at a glance.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { TOPOLOGY } from '../domain/topology';
import type { Severity } from '../domain/types';
import { alarmCounts, type AlarmGroup } from '../sim/alarmFeed';
import type { AlarmEvent } from '../sim/alarmHistory';
import { EventLog } from './EventLog';
import { fmtCountdown } from './format';
import { clampConsoleHeight, CONSOLE_MIN, consoleMax } from '../store/persist';
import type { AlarmFilters } from '../store/useSiteStore';
import './console.css';

export type ConsoleTab = 'active' | 'history';

interface Props {
  groups: AlarmGroup[];
  /** Unfiltered site-wide alarm count, so the console can say how many it is hiding. */
  totalAlarms: number;
  events: AlarmEvent[];
  tab: ConsoleTab;
  onTab: (t: ConsoleTab) => void;
  /** Store clock, so the shelve countdown ticks without its own timer. */
  now: number;
  filters: AlarmFilters;
  collapsed: boolean;
  height: number;
  onHeight: (h: number) => void;
  onToggleCollapsed: () => void;
  onFilters: (patch: Partial<AlarmFilters>) => void;
  onAck: (group: AlarmGroup) => void;
  onShelve: (group: AlarmGroup) => void;
  onUnshelve: (group: AlarmGroup) => void;
  onFocusAsset: (assetId: string) => void;
}

export const AlarmConsole = memo(function AlarmConsole({
  groups,
  totalAlarms,
  events,
  tab,
  onTab,
  now,
  filters,
  collapsed,
  height,
  onHeight,
  onToggleCollapsed,
  onFilters,
  onAck,
  onShelve,
  onUnshelve,
  onFocusAsset,
}: Props) {
  const counts = alarmCounts(groups);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered =
    filters.assetId !== null || filters.severity !== null || !filters.showShelved;
  const hidden = Math.max(0, totalAlarms - groups.reduce((n, g) => n + g.count, 0));

  /**
   * SAFETY: the rendered order is frozen while the operator is working in the list.
   *
   * The feed re-sorts every second. Without this, a row can slide out from under the pointer
   * between the decision to click Ack and the click landing — and the operator acknowledges a
   * different alarm than the one they read. Rows keep their positions while the pointer or
   * keyboard focus is inside the list, and re-sort the moment it leaves.
   *
   * New alarms are never hidden by the freeze: unknown ids are appended, so an arrival during
   * an interaction still shows up, just at the bottom until the order settles.
   */
  const [frozen, setFrozen] = useState(false);
  const orderRef = useRef<string[]>([]);

  if (!frozen) {
    orderRef.current = groups.map((g) => g.id);
  }

  const ordered = frozen
    ? [
        ...orderRef.current
          .map((id) => groups.find((g) => g.id === id))
          .filter((g): g is AlarmGroup => g !== undefined),
        ...groups.filter((g) => !orderRef.current.includes(g.id)),
      ]
    : groups;

  // ---- resize by dragging the top edge ----
  const drag = useRef<{ y: number; h: number } | null>(null);

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, h: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null) return;
    // Dragging up grows the console, which is why the delta is inverted.
    onHeight(clampConsoleHeight(d.h + (d.y - e.clientY)));
  };

  const onHandleUp = () => {
    drag.current = null;
  };

  /** Keyboard resize, so the handle isn't pointer-only. */
  const onHandleKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onHeight(clampConsoleHeight(height + step));
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onHeight(clampConsoleHeight(height - step));
    }
  };

  // A stored height taller than the current viewport must be brought back into range.
  useEffect(() => {
    const onResize = () => onHeight(clampConsoleHeight(height));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [height, onHeight]);

  const freeze = useCallback(() => setFrozen(true), []);
  const thaw = useCallback(() => setFrozen(false), []);

  return (
    <section
      className="console"
      data-collapsed={collapsed || undefined}
      style={collapsed ? undefined : { height }}
      aria-label="Alarm console"
    >
      {!collapsed && (
        <div
          className="console-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize alarm console"
          aria-valuenow={height}
          aria-valuemin={CONSOLE_MIN}
          aria-valuemax={consoleMax()}
          tabIndex={0}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
        >
          <span className="console-grip" aria-hidden="true" />
        </div>
      )}

      <header className="console-head">
        <button
          type="button"
          className="console-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand alarm console' : 'Collapse alarm console'}
        >
          <span className="console-chevron" aria-hidden="true">
            {collapsed ? '▲' : '▼'}
          </span>
        </button>

        {!collapsed && (
          <div className="console-tabs" role="tablist" aria-label="Alarm views">
            <button
              type="button"
              className="console-tab"
              role="tab"
              aria-selected={tab === 'active'}
              onClick={() => onTab('active')}
            >
              Active
            </button>
            <button
              type="button"
              className="console-tab"
              role="tab"
              aria-selected={tab === 'history'}
              onClick={() => onTab('history')}
            >
              History
            </button>
          </div>
        )}
        {collapsed && <span className="console-toggle-label">Alarms</span>}

        {/* Counts stay visible when collapsed — this is the at-a-glance signal. */}
        <div className="console-counts">
          <Count severity="critical" n={counts.critical} />
          <Count severity="warning" n={counts.warning} />
          {counts.shelved > 0 && (
            <span className="count" data-kind="shelved">
              <span className="count-n metric">{counts.shelved}</span> shelved
            </span>
          )}
          {frozen && (
            <span className="console-frozen" title="Order held while you work in the list">
              order held
            </span>
          )}
        </div>

        <div className="console-filters">
          {/*
            Both filters are the same control, same size, same behaviour. A native <select>
            also gets keyboard type-ahead for free, so it still works at sixty skids.
          */}
          <select
            className="console-filter"
            aria-label="Filter by asset"
            data-active={filters.assetId !== null || undefined}
            value={filters.assetId ?? ''}
            onChange={(e) => onFilters({ assetId: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">All assets</option>
            {TOPOLOGY.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>

          <select
            className="console-filter"
            aria-label="Filter by severity"
            data-active={filters.severity !== null || undefined}
            value={filters.severity ?? ''}
            onChange={(e) =>
              onFilters({ severity: e.target.value === '' ? null : (e.target.value as Severity) })
            }
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>

          <label className="console-check">
            <input
              type="checkbox"
              checked={filters.showShelved}
              onChange={(e) => onFilters({ showShelved: e.target.checked })}
            />
            Show shelved
          </label>

          {/*
            A filtered alarm list is a partial view of the site, and forgetting that is how an
            operator misses something. The badge states it plainly and clears in one click.
          */}
          {filtered && (
            <button
              type="button"
              className="console-filter-clear"
              onClick={() => onFilters({ assetId: null, severity: null, showShelved: true })}
              title="Clear all filters"
            >
              Filtered · {hidden} hidden ✕
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div
          className="console-body"
          ref={listRef}
          onPointerEnter={freeze}
          onPointerLeave={thaw}
          onFocusCapture={freeze}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) thaw();
          }}
        >
          {tab === 'history' ? (
            <EventLog events={events} />
          ) : ordered.length === 0 ? (
            <p className="console-empty">
              {groups.length === 0 ? 'No active alarms.' : 'No alarms match the current filters.'}
            </p>
          ) : (
            <ul className="console-list">
              {ordered.map((g) => (
                <AlarmRow
                  key={g.id}
                  group={g}
                  now={now}
                  onAck={onAck}
                  onShelve={onShelve}
                  onUnshelve={onUnshelve}
                  onFocusAsset={onFocusAsset}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
});

function Count({ severity, n }: { severity: Severity; n: number }) {
  return (
    <span className="count" data-kind={severity} data-zero={n === 0 || undefined}>
      <span className="count-n metric">{n}</span> {severity}
    </span>
  );
}

const AlarmRow = memo(function AlarmRow({
  group,
  now,
  onAck,
  onShelve,
  onUnshelve,
  onFocusAsset,
}: {
  group: AlarmGroup;
  now: number;
  onAck: (g: AlarmGroup) => void;
  onShelve: (g: AlarmGroup) => void;
  onUnshelve: (g: AlarmGroup) => void;
  onFocusAsset: (assetId: string) => void;
}) {
  return (
    <li
      className="alarm"
      data-severity={group.severity}
      data-acked={group.acknowledged || undefined}
      data-shelved={group.shelved || undefined}
      data-grouped={group.grouped || undefined}
    >
      <span className="alarm-dot" aria-hidden="true" />

      {/* Clicking the row focuses that asset on the diagram. Grouped rows have no single
          asset to focus, so only single rows are clickable. */}
      <button
        type="button"
        className="alarm-asset metric"
        disabled={group.assetId === null}
        onClick={() => group.assetId !== null && onFocusAsset(group.assetId)}
      >
        {group.assetId ?? `${group.entries.length} assets`}
      </button>

      <span className="alarm-code metric">{group.code}</span>

      {group.grouped && (
        <span className="alarm-count metric" title={`${group.count} occurrences rolled up`}>
          ×{group.count}
        </span>
      )}

      {/* title gives the full text an escape hatch: the row truncates with an ellipsis. */}
      <span className="alarm-msg" title={group.message}>
        {group.message}
      </span>

      {group.shelved && group.shelvedUntil !== null && (
        <span className="alarm-shelf-timer" title="Shelve expires automatically">
          {fmtCountdown(group.shelvedUntil - now)}
        </span>
      )}

      <span className="alarm-severity">{group.severity}</span>

      <span className="alarm-actions">
        {group.shelved ? (
          <button type="button" onClick={() => onUnshelve(group)}>
            Unshelve
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onAck(group)} disabled={group.acknowledged}>
              {group.acknowledged ? 'Acked' : 'Ack'}
            </button>
            <button type="button" onClick={() => onShelve(group)}>
              Shelve
            </button>
          </>
        )}
      </span>
    </li>
  );
});
