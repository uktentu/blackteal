import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSiteStore, buildSummary, buildAlarmGroups } from './store/useSiteStore';
import { loadLayout, saveLayout, clampConsoleHeight } from './store/persist';
import { TOPOLOGY } from './domain/topology';
import { Diagram } from './components/Diagram';
import { IsoScene } from './components/IsoScene';
import { TopStrip } from './components/TopStrip';
import { DetailDrawer } from './components/DetailDrawer';
import { Legend } from './components/Legend';
import { AlarmConsole } from './components/AlarmConsole';
import type { AlarmGroup } from './sim/alarmFeed';
import { forAsset, recent } from './sim/alarmHistory';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { ConsoleTab } from './components/AlarmConsole';
import './components/app.css';

const LABELS = Object.fromEntries(TOPOLOGY.assets.map((a) => [a.id, a.label]));

export default function App() {
  const site = useSiteStore((s) => s.site);
  const stale = useSiteStore((s) => s.stale);
  const lastFrameAt = useSiteStore((s) => s.lastFrameAt);
  const selectedId = useSiteStore((s) => s.selectedId);
  const filters = useSiteStore((s) => s.filters);
  const acknowledged = useSiteStore((s) => s.acknowledged);
  const shelvedUntil = useSiteStore((s) => s.shelvedUntil);
  const raisedAt = useSiteStore((s) => s.raisedAt);
  const events = useSiteStore((s) => s.events);
  const now = useSiteStore((s) => s.now);
  const history = useSiteStore((s) => s.history);

  // Derived here, not in a store selector: both allocate a new object graph per call, which
  // zustand v5 would read as a changed snapshot on every render.
  const summary = useMemo(() => buildSummary(site), [site]);
  const groups = useMemo(
    () => buildAlarmGroups(site, acknowledged, shelvedUntil, raisedAt, filters),
    [site, acknowledged, shelvedUntil, raisedAt, filters],
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

  // Layout is restored once on mount, then written back whenever it changes.
  const [layout, setLayout] = useState(loadLayout);
  const { consoleHeight, consoleCollapsed } = layout;

  useEffect(() => {
    saveLayout({
      ...layout,
      filterAssetId: filters.assetId,
      filterSeverity: filters.severity,
      showShelved: filters.showShelved,
    });
  }, [layout, filters]);

  // Apply the restored filters once the store is live.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setFilters({
      assetId: layout.filterAssetId,
      severity: layout.filterSeverity,
      showShelved: layout.showShelved,
    });
  }, [layout, setFilters]);

  const setView = useCallback(
    (v: 'diagram' | 'site') => setLayout((l) => ({ ...l, view: v })),
    [],
  );

  const setConsoleHeight = useCallback(
    (h: number) => setLayout((l) => ({ ...l, consoleHeight: clampConsoleHeight(h) })),
    [],
  );

  const [flashedId, setFlashedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ConsoleTab>('active');

  const recentEvents = useMemo(() => recent(events), [events]);
  const totalAlarms = useMemo(
    () => Object.values(site.assets).reduce((n, a) => n + a.alarms.length, 0),
    [site],
  );
  const assetEvents = useMemo(
    () => (selectedId === null ? [] : forAsset(events, selectedId)),
    [events, selectedId],
  );

  /**
   * Screen-reader announcement for newly raised alarms.
   *
   * A non-visual operator otherwise gets nothing: counts change and rows arrive in silence.
   * Only *raised* events are announced, and only the newest — narrating every clear as well
   * would turn a flood into an unusable stream of speech.
   */
  const [announcement, setAnnouncement] = useState('');
  const lastAnnouncedSeq = useRef(-1);

  useEffect(() => {
    const raised = events.filter((e) => e.kind === 'raised' && e.seq > lastAnnouncedSeq.current);
    if (raised.length === 0) return;
    lastAnnouncedSeq.current = events[events.length - 1].seq;

    const newest = raised[raised.length - 1];
    setAnnouncement(
      raised.length === 1
        ? `${newest.severity} alarm on ${newest.assetId}: ${newest.message}`
        : `${raised.length} new alarms. Most recent: ${newest.severity} on ${newest.assetId}, ${newest.message}`,
    );
  }, [events]);

  /**
   * Jumping from an alarm row to its asset: select it AND flash it.
   *
   * Selection alone is not enough during a flood — the operator's eye is in the console, and
   * a ring that quietly appears somewhere on the diagram is easy to miss.
   */
  const focusAsset = useCallback((assetId: string) => {
    select(assetId);
    setFlashedId(assetId);
    window.setTimeout(() => setFlashedId((cur) => (cur === assetId ? null : cur)), 1900);
  }, [select]);

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

  /**
   * Move focus into the drawer when it opens and return it when it closes.
   *
   * Without this a keyboard operator opens a panel and their focus is still on the diagram,
   * so Tab walks the page behind the thing they just opened.
   */
  const drawerRef = useRef<HTMLElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const prevSelected = useRef<string | null>(null);

  useEffect(() => {
    const opened = prevSelected.current === null && selectedId !== null;
    const closed = prevSelected.current !== null && selectedId === null;
    prevSelected.current = selectedId;

    if (opened) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      drawerRef.current?.querySelector<HTMLElement>('.drawer-close')?.focus();
    } else if (closed) {
      returnFocusTo.current?.focus();
      returnFocusTo.current = null;
    }
  }, [selectedId]);

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
        staleForMs={now - lastFrameAt}
        now={now}
        view={layout.view}
        onView={setView}
        onSimulateBurst={() => trigger('burst')}
        onSimulateDropout={() => trigger('dropout')}
      />

      {/*
        Live region for alarm announcements. Visually hidden, assertive because a new critical
        alarm should interrupt rather than queue behind whatever is being read.
      */}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      <div className="app-body">
        <section className="app-diagram" aria-label="Site diagram">
          <div className="app-canvas">
            <ErrorBoundary label="The site view">
              {layout.view === 'site' ? (
                <IsoScene
                  site={site}
                  selectedId={selectedId}
                  flashedId={flashedId}
                  stale={stale}
                  onSelect={select}
                />
              ) : (
                <Diagram
                  site={site}
                  selectedId={selectedId}
                  flashedId={flashedId}
                  stale={stale}
                  onSelect={select}
                />
              )}
            </ErrorBoundary>
          </div>
          <Legend flowing={!stale} />
        </section>

        <DetailDrawer
          ref={drawerRef}
          events={assetEvents}
          assetId={selectedId}
          label={selectedId === null ? '' : (LABELS[selectedId] ?? selectedId)}
          asset={selectedAsset}
          history={selectedId === null ? [] : (history[selectedId] ?? [])}
          stale={stale}
          lastFrameAt={lastFrameAt}
          onClose={() => select(null)}
        />
      </div>

      <ErrorBoundary label="The alarm console">
        <AlarmConsole
        groups={groups}
        totalAlarms={totalAlarms}
        events={recentEvents}
        tab={tab}
        onTab={setTab}
        now={now}
        filters={filters}
        collapsed={consoleCollapsed}
        height={consoleHeight}
        onHeight={setConsoleHeight}
        onToggleCollapsed={() => setLayout((l) => ({ ...l, consoleCollapsed: !l.consoleCollapsed }))}
        onFilters={setFilters}
        onAck={onAck}
        onShelve={onShelve}
        onUnshelve={onUnshelve}
        onFocusAsset={focusAsset}
        />
      </ErrorBoundary>
    </div>
  );
}
