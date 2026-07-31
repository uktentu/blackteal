/**
 * Alarm console — Stage 1.
 *
 * "Real operators can act on only ~6-12 alarms/hour, so surfacing the one that matters — and
 * not burying it — is the whole job." Everything here serves that: priority sort, ack, shelve,
 * filters, and flood grouping.
 *
 * Docked and collapsible. The severity-count header stays visible when collapsed, because the
 * counts are the part an operator needs at a glance.
 */

import { memo } from 'react';
import { TOPOLOGY } from '../domain/topology';
import type { Severity } from '../domain/types';
import { alarmCounts, type AlarmGroup } from '../sim/alarmFeed';
import type { AlarmFilters } from '../store/useSiteStore';
import './console.css';

interface Props {
  groups: AlarmGroup[];
  filters: AlarmFilters;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onFilters: (patch: Partial<AlarmFilters>) => void;
  onAck: (group: AlarmGroup) => void;
  onShelve: (group: AlarmGroup) => void;
  onUnshelve: (group: AlarmGroup) => void;
  onFocusAsset: (assetId: string) => void;
}

export const AlarmConsole = memo(function AlarmConsole({
  groups,
  filters,
  collapsed,
  onToggleCollapsed,
  onFilters,
  onAck,
  onShelve,
  onUnshelve,
  onFocusAsset,
}: Props) {
  const counts = alarmCounts(groups);

  return (
    <section className="console" data-collapsed={collapsed || undefined} aria-label="Alarm console">
      <header className="console-head">
        <button
          type="button"
          className="console-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
        >
          <span className="console-chevron" aria-hidden="true">
            {collapsed ? '▲' : '▼'}
          </span>
          Alarms
        </button>

        {/* Counts stay visible when collapsed — this is the at-a-glance signal. */}
        <div className="console-counts">
          <Count severity="critical" n={counts.critical} />
          <Count severity="warning" n={counts.warning} />
          {counts.shelved > 0 && (
            <span className="count" data-kind="shelved">
              <span className="count-n metric">{counts.shelved}</span> shelved
            </span>
          )}
        </div>

        <div className="console-filters">
          <select
            aria-label="Filter by asset"
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
            aria-label="Filter by severity"
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
        </div>
      </header>

      {!collapsed && (
        <div className="console-body">
          {groups.length === 0 ? (
            <p className="console-empty">No alarms match the current filters.</p>
          ) : (
            <ul className="console-list">
              {groups.map((g) => (
                <AlarmRow
                  key={g.id}
                  group={g}
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
  onAck,
  onShelve,
  onUnshelve,
  onFocusAsset,
}: {
  group: AlarmGroup;
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

      <span className="alarm-msg">{group.message}</span>

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
