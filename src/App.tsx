import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSiteStore, buildSummary, buildAlarmGroups } from './store/useSiteStore';
import { TOPOLOGY } from './domain/topology';
import { Diagram } from './components/Diagram';
import { TopStrip } from './components/TopStrip';
import { DetailDrawer } from './components/DetailDrawer';
import { AlarmConsole } from './components/AlarmConsole';
import type { AlarmGroup } from './sim/alarmFeed';
import './components/app.css';

const LABELS = Object.fromEntries(TOPOLOGY.assets.map((a) => [a.id, a.label]));

export default function App() {
  const site = useSiteStore((s) => s.site);
  const stale = useSiteStore((s) => s.stale);
  const lastFrameAt = useSiteStore((s) => s.lastFrameAt);
  const selectedId = useSiteStore((s) => s.selectedId);
  const filters = useSiteStore((s) => s.filters);
  const acknowledged = useSiteStore((s) => s.acknowledged);
  const shelved = useSiteStore((s) => s.shelved);

  // Derived here, not in a store selector: both allocate a new object graph per call, which
  // zustand v5 would read as a changed snapshot on every render.
  const summary = useMemo(() => buildSummary(site), [site]);
  const groups = useMemo(
    () => buildAlarmGroups(site, acknowledged, shelved, filters),
    [site, acknowledged, shelved, filters],
  );

  const start = useSiteStore((s) => s.start);
  const stop = useSiteStore((s) => s.stop);
  const select = useSiteStore((s) => s.select);
  const selectAdjacent = useSiteStore((s) => s.selectAdjacent);
  const trigger = useSiteStore((s) => s.trigger);
  const setFilters = useSiteStore((s) => s.setFilters);
  const acknowledge = useSiteStore((s) => s.acknowledge);
  const shelve = useSiteStore((s) => s.shelve);
  const unshelve = useSiteStore((s) => s.unshelve);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // Esc closes the drawer; arrow keys cycle assets while one is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack arrows while the operator is in a filter control.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT') return;

      if (e.key === 'Escape') select(null);
      if (selectedId === null) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        selectAdjacent(1);
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectAdjacent(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select, selectAdjacent, selectedId]);

  // Alarm actions apply to every entry in a group, so acking a rolled-up flood acks the flood.
  const onAck = useCallback(
    (g: AlarmGroup) => g.entries.forEach((e) => acknowledge(e.assetId, e.alarm)),
    [acknowledge],
  );
  const onShelve = useCallback(
    (g: AlarmGroup) => g.entries.forEach((e) => shelve(e.assetId, e.alarm)),
    [shelve],
  );
  const onUnshelve = useCallback(
    (g: AlarmGroup) => g.entries.forEach((e) => unshelve(e.assetId, e.alarm)),
    [unshelve],
  );

  const selectedAsset = useMemo(
    () => (selectedId === null ? null : (site.assets[selectedId] ?? null)),
    [selectedId, site],
  );

  return (
    <div className="app" data-stale={stale || undefined}>
      <TopStrip
        load_MW={summary.load_MW}
        grid_MW={summary.grid_MW}
        bess_MW={summary.bess_MW}
        needsAttention={summary.needsAttention}
        worst={summary.worst}
        stale={stale}
        staleForMs={Date.now() - lastFrameAt}
        onSimulateBurst={() => trigger('burst')}
        onSimulateDropout={() => trigger('dropout')}
      />

      <div className="app-body">
        <section className="app-diagram" aria-label="Site diagram">
          <Diagram site={site} selectedId={selectedId} stale={stale} onSelect={select} />
        </section>

        <DetailDrawer
          assetId={selectedId}
          label={selectedId === null ? '' : (LABELS[selectedId] ?? selectedId)}
          asset={selectedAsset}
          stale={stale}
          lastFrameAt={lastFrameAt}
          onClose={() => select(null)}
        />
      </div>

      <AlarmConsole
        groups={groups}
        filters={filters}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onFilters={setFilters}
        onAck={onAck}
        onShelve={onShelve}
        onUnshelve={onUnshelve}
        onFocusAsset={select}
      />
    </div>
  );
}
