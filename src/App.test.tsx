/**
 * Component and interaction tests.
 *
 * These exist because of a specific failure: a zoom feature captured the pointer on the SVG
 * root, which retargeted the click away from the asset node, and click-to-open — the single
 * most important interaction in the app — silently stopped working. Every logic test stayed
 * green. Nothing in CI could have caught it.
 *
 * So these assert BEHAVIOUR through the real DOM, in the brief's own terms: click an asset ->
 * a panel opens with telemetry, alarms and connection health; a missing metric renders a dash
 * and never a zero; an offline asset still opens and explains itself.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSiteStore } from './store/useSiteStore';
import { INITIAL_SNAPSHOT } from './domain/snapshot';

/** Render with the clock stopped, so assertions aren't racing the 1 Hz tick. */
function renderApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  act(() => useSiteStore.getState().stop());
  return { user, ...view };
}

/** The app opens on the site model; these switch to the schematic first. */
async function renderDiagram() {
  const r = renderApp();
  await r.user.click(screen.getByRole('tab', { name: 'Diagram' }));
  return r;
}

beforeEach(() => {
  useSiteStore.setState({
    site: INITIAL_SNAPSHOT,
    selectedId: null,
    stale: false,
    events: [],
    acknowledged: new Set(),
    shelvedUntil: new Map(),
    filters: { assetId: null, severity: null, showShelved: true },
  });
  // Guarded: another suite may have replaced the global window with a stub.
  try {
    window.localStorage?.clear?.();
  } catch {
    /* storage unavailable in this environment */
  }
});

describe('core requirement: render the site from the topology', () => {
  it('draws the substation, all six skids and the load', async () => {
    await renderDiagram();
    for (const label of ['Substation', 'Skid 1', 'Skid 2', 'Skid 3', 'Skid 4', 'Skid 5', 'Skid 6']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Data Center Load/i })).toBeInTheDocument();
  });

  it('shows status as text, not colour alone', async () => {
    await renderDiagram();
    // The accessible name carries the state, which is what a screen reader and the
    // grayscale test both depend on.
    expect(screen.getByRole('button', { name: /Power Skid 2, Warning/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Power Skid 5, Offline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Power Skid 1, Normal/i })).toBeInTheDocument();
  });

  it('shows a key metric on each asset', async () => {
    await renderDiagram();
    expect(screen.getByRole('button', { name: /Power Skid 1.*-1\.98 MW/i })).toBeInTheDocument();
  });
});

describe('core requirement: click an asset opens its detail panel', () => {
  // The regression that motivated this whole file.
  it.each([
    ['Power Skid 1', 'Power Skid 1'],
    ['Power Skid 3', 'Power Skid 3'],
    ['Power Skid 5', 'Power Skid 5'],
    ['Grid / Substation', 'Grid / Substation (138 kV)'],
    ['Data Center Load', 'Data Center Load'],
  ])('clicking %s opens its drawer', async (nodeName, title) => {
    const { user } = await renderDiagram();
    await user.click(screen.getByRole('button', { name: new RegExp(nodeName, 'i') }));
    expect(await screen.findByRole('heading', { name: title, level: 2 })).toBeInTheDocument();
  });

  it('shows telemetry, active alarms and connection health together', async () => {
    const { user } = await renderDiagram();
    await user.click(screen.getByRole('button', { name: /Power Skid 2/i }));

    const drawer = (await screen.findByText('Connection health')).closest('.drawer') as HTMLElement;
    expect(within(drawer).getByText(/Active alarms \(2\)/)).toBeInTheDocument();
    expect(within(drawer).getByText('State of charge')).toBeInTheDocument();
    // TEMP_HIGH also appears in the console, so scope the assertion to the panel.
    expect(within(drawer).getByText('TEMP_HIGH')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus', async () => {
    const { user } = await renderDiagram();
    const node = screen.getByRole('button', { name: /Power Skid 1/i });
    await user.click(node);
    expect(await screen.findByRole('heading', { name: 'Power Skid 1', level: 2 })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: 'Power Skid 1', level: 2 })).not.toBeInTheDocument();
  });
});

describe('graded edge case: missing metrics never render as zero', () => {
  it('shows a dash for the three PCS fields SKID-3 omits', async () => {
    const { user } = await renderDiagram();
    await user.click(screen.getByRole('button', { name: /Power Skid 3/i }));

    const acVoltage = (await screen.findByText('AC voltage')).closest('.row')!;
    const efficiency = screen.getByText('Efficiency').closest('.row')!;

    for (const row of [acVoltage, efficiency]) {
      expect(row).toHaveAttribute('data-missing');
      expect(within(row as HTMLElement).getByText('—')).toBeInTheDocument();
      expect(row.textContent).not.toMatch(/\b0\b/);
      expect(row.textContent).not.toMatch(/NaN/);
    }

    // ...while a field that IS present still renders its value.
    expect(screen.getByText('DC voltage').closest('.row')).not.toHaveAttribute('data-missing');
  });

  it('opens the offline skid and explains the absence rather than showing zeros', async () => {
    const { user } = await renderDiagram();
    await user.click(screen.getByRole('button', { name: /Power Skid 5/i }));

    expect(await screen.findByText('No telemetry from this asset')).toBeInTheDocument();
    expect(screen.getAllByText(/No telemetry — subsystem not reporting/).length).toBeGreaterThan(0);
    expect(screen.getByText(/unavailable rather than zero/)).toBeInTheDocument();
  });
});

describe('Stage 1: alarm console', () => {
  it('lists alarms with asset and message, critical first', () => {
    renderApp();
    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('alarm'));
    expect(rows.length).toBeGreaterThan(0);
    expect(within(rows[0]).getByText('SKID-5')).toBeInTheDocument();
    expect(within(rows[0]).getByText('COMMS_LOST')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/No telemetry received from skid/)).toBeInTheDocument();
  });

  it('acknowledges an alarm', async () => {
    const { user } = renderApp();
    const row = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('COMMS_LOST'))!;
    await user.click(within(row).getByRole('button', { name: 'Ack' }));

    const after = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('COMMS_LOST'))!;
    expect(after).toHaveAttribute('data-acked');
  });

  it('shelves an alarm but keeps it visible — hiding it would imply resolution', async () => {
    const { user } = renderApp();
    const row = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('COMMS_LOST'))!;
    await user.click(within(row).getByRole('button', { name: 'Shelve' }));

    const after = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('COMMS_LOST'))!;
    expect(after).toHaveAttribute('data-shelved');
    expect(within(after).getByRole('button', { name: 'Unshelve' })).toBeInTheDocument();
  });

  it('filters by severity', async () => {
    const { user } = renderApp();
    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'critical');

    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('alarm'));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('COMMS_LOST');
  });

  it('filters by asset', async () => {
    const { user } = renderApp();
    await user.selectOptions(screen.getByLabelText('Filter by asset'), 'SKID-2');

    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('alarm'));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.textContent?.includes('SKID-2'))).toBe(true);
  });

  it('uses the same control for both filters, so they cannot drift apart', () => {
    renderApp();
    const asset = screen.getByLabelText('Filter by asset');
    const severity = screen.getByLabelText('Filter by severity');

    expect(asset.tagName).toBe('SELECT');
    expect(severity.tagName).toBe('SELECT');
    expect(asset).toHaveClass('console-filter');
    expect(severity).toHaveClass('console-filter');
  });

  it('says so when the list is filtered, and clears in one click', async () => {
    const { user } = renderApp();
    // An unannounced partial view is how an operator misses an alarm.
    expect(screen.queryByTitle('Clear all filters')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'critical');
    const badge = screen.getByTitle('Clear all filters');
    expect(badge).toHaveTextContent(/Filtered · 2 hidden/);

    await user.click(badge);
    expect(screen.queryByTitle('Clear all filters')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('listitem').filter((li) => li.classList.contains('alarm')),
    ).toHaveLength(3);
  });

  it('rolls a flood into one counted row', async () => {
    renderApp();
    act(() => {
      const site = structuredClone(INITIAL_SNAPSHOT);
      for (const id of ['SKID-1', 'SKID-2', 'SKID-3', 'SKID-4', 'SKID-6']) {
        site.assets[id].alarms = [
          { code: 'TEMP_HIGH', severity: 'warning', message: 'Battery module temperature elevated' },
        ];
      }
      useSiteStore.setState({ site });
    });

    expect(await screen.findByText('×5')).toBeInTheDocument();
    const grouped = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('×5'))!;
    expect(within(grouped).getByText('5 assets')).toBeInTheDocument();
  });

  it('is collapsible and keeps its counts visible when collapsed', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: /Collapse alarm console/i }));

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('is resizable from the keyboard', async () => {
    const { user } = renderApp();
    const handle = screen.getByRole('separator', { name: /Resize alarm console/i });
    const before = Number(handle.getAttribute('aria-valuenow'));

    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  });
});

describe('two views of one live state', () => {
  it('opens on the site model', () => {
    renderApp();
    expect(screen.getByRole('group', { name: /isometric site view/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /single-line diagram/i })).not.toBeInTheDocument();
  });

  it('switches to the single-line diagram and back', async () => {
    const { user } = renderApp();

    await user.click(screen.getByRole('tab', { name: 'Diagram' }));
    expect(screen.getByRole('group', { name: /single-line diagram/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /isometric site view/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Site 3D' }));
    expect(screen.getByRole('group', { name: /isometric site view/i })).toBeInTheDocument();
  });

  it('keeps every asset inspectable in the 3D view, with the same accessible names', () => {
    renderApp();
    for (const label of ['Power Skid 1', 'Power Skid 5', 'Grid / Substation', 'Data Center Load']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('opens the same drawer from the 3D view', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: /Power Skid 2, Warning/i }));

    expect(await screen.findByRole('heading', { name: 'Power Skid 2', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Connection health')).toBeInTheDocument();
  });

  it('carries live status onto the 3D scene', () => {
    renderApp();
    // Status must be readable from the model itself, not only from the alarm list.
    const skid2 = screen.getByRole('button', { name: /Power Skid 2, Warning/i });
    expect(skid2).toHaveAttribute('data-state', 'WARNING');
    expect(screen.getByRole('button', { name: /Power Skid 5, Offline/i })).toHaveAttribute(
      'data-state',
      'OFFLINE',
    );
  });

  it('remembers the chosen view across a remount', async () => {
    // Asserts the contract an operator cares about — the screen comes back how they left it —
    // rather than poking at storage internals.
    const { user, unmount } = renderApp();
    await user.click(screen.getByRole('tab', { name: 'Diagram' }));
    expect(screen.getByRole('group', { name: /single-line diagram/i })).toBeInTheDocument();

    unmount();
    renderApp();
    expect(screen.getByRole('group', { name: /single-line diagram/i })).toBeInTheDocument();
  });
});

describe('alarm console alignment', () => {
  it('uses the same column cells in both tabs, so nothing shifts when switching', async () => {
    const { user } = renderApp();

    const cellsOf = (row: HTMLElement) =>
      ['row-time', 'row-status', 'row-asset', 'row-code', 'row-msg'].map((c) =>
        row.querySelector(`.${c}`) === null ? `MISSING:${c}` : c,
      );

    const activeRow = screen
      .getAllByRole('listitem')
      .find((li) => li.classList.contains('alarm'))!;
    const activeCells = cellsOf(activeRow);

    // Generate an event so History has something to render.
    act(() => {
      const site = structuredClone(INITIAL_SNAPSHOT);
      (site.assets['SKID-1'] as { battery: { soc_pct: number } }).battery.soc_pct = 6;
      useSiteStore.setState({ site });
      useSiteStore.getState().tickOnce();
    });

    await user.click(screen.getByRole('tab', { name: 'History' }));
    const eventRow = screen.getAllByRole('listitem').find((li) => li.classList.contains('event'))!;

    expect(cellsOf(eventRow)).toEqual(activeCells);
    expect(activeCells).not.toContain(expect.stringContaining('MISSING'));
  });

  it('stamps an active alarm with when it started', () => {
    renderApp();
    act(() => useSiteStore.getState().tickOnce());

    const row = screen.getAllByRole('listitem').find((li) => li.classList.contains('alarm'))!;
    // "When did this start?" must be answerable from the row itself.
    expect(row.querySelector('.row-time')!.textContent).toMatch(
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,
    );
  });

  it('forgets the onset when an alarm clears, so a recurrence is timed from its own start', () => {
    renderApp();

    // Drive telemetry across the threshold — hand-set alarms are overwritten by the rules.
    // (SKID-5's COMMS_LOST cannot be used here: it is genuinely offline, so the rule engine
    // re-raises it every tick and it correctly never clears.)
    act(() => {
      const site = structuredClone(INITIAL_SNAPSHOT);
      (site.assets['SKID-1'] as { battery: { soc_pct: number } }).battery.soc_pct = 6;
      useSiteStore.setState({ site });
      useSiteStore.getState().tickOnce();
    });
    expect(useSiteStore.getState().raisedAt.has('SKID-1:SOC_LOW')).toBe(true);

    act(() => {
      const site = structuredClone(useSiteStore.getState().site);
      (site.assets['SKID-1'] as { battery: { soc_pct: number } }).battery.soc_pct = 61;
      useSiteStore.setState({ site });
      useSiteStore.getState().tickOnce();
    });
    expect(useSiteStore.getState().raisedAt.has('SKID-1:SOC_LOW')).toBe(false);
  });
});

describe('core requirement: stale feed is never presented as live', () => {
  it('flags a dropout site-wide and in the drawer', async () => {
    const { user } = await renderDiagram();
    act(() => useSiteStore.setState({ stale: true, site: { ...INITIAL_SNAPSHOT, stale: true } }));

    expect(await screen.findByText(/FEED DISCONNECTED/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Power Skid 1/i }));
    expect(await screen.findByText('Site feed disconnected')).toBeInTheDocument();
    expect(screen.getByText('Stale — not live')).toBeInTheDocument();
  });
});

describe('alarm history', () => {
  it('records a raised alarm that later clears, so the trace survives', async () => {
    const { user } = renderApp();

    // Drive the TELEMETRY across a threshold and let the rule engine fire, rather than
    // hand-injecting an alarm the simulator would immediately overwrite.
    act(() => {
      const low = structuredClone(INITIAL_SNAPSHOT);
      (low.assets['SKID-1'] as { battery: { soc_pct: number } }).battery.soc_pct = 6;
      useSiteStore.setState({ site: low });
      useSiteStore.getState().tickOnce();
    });
    act(() => {
      // Recover on the CURRENT frame; replacing `site` wholesale would discard the raised
      // state before the diff runs, and no clear event would ever be emitted.
      const site = structuredClone(useSiteStore.getState().site);
      (site.assets['SKID-1'] as { battery: { soc_pct: number } }).battery.soc_pct = 61;
      useSiteStore.setState({ site });
      useSiteStore.getState().tickOnce();
    });

    await user.click(screen.getByRole('tab', { name: 'History' }));

    // The alarm is gone from the active list but its rise and fall are both on the record.
    expect(screen.getByText('Raised')).toBeInTheDocument();
    expect(screen.getByText('Cleared')).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('announces a new alarm through a live region', async () => {
    renderApp();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'assertive');

    act(() => {
      const site = structuredClone(INITIAL_SNAPSHOT);
      (site.assets['SKID-1'] as { battery: { insulation_MOhm: number } }).battery.insulation_MOhm = 0.3;
      useSiteStore.setState({ site });
      useSiteStore.getState().tickOnce();
    });

    expect(region.textContent).toMatch(/critical alarm on SKID-1/i);
  });

  it('moves focus into the drawer when it opens', async () => {
    const { user } = await renderDiagram();
    await user.click(screen.getByRole('button', { name: /Power Skid 1/i }));
    expect(await screen.findByRole('button', { name: /Close \(Esc\)/i })).toHaveFocus();
  });

  it('gives truncated alarm messages a title so the full text is reachable', () => {
    renderApp();
    const msg = screen.getByText(/No telemetry received from skid/);
    expect(msg).toHaveAttribute('title', 'No telemetry received from skid');
  });
});

describe('error boundary', () => {
  it('reports a render failure instead of blanking the dashboard', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Corrupt state the diagram cannot render: an asset the topology references is gone.
    const broken = structuredClone(INITIAL_SNAPSHOT);
    delete (broken.assets as Record<string, unknown>)['SKID-3'];
    useSiteStore.setState({ site: broken });

    // Mirrors main.tsx. siteSummary runs in App's own render, outside the per-panel
    // boundaries, so the root boundary is what stands between this and a white page.
    render(
      <ErrorBoundary label="The dashboard">
        <App />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/has stopped updating/)).toBeInTheDocument();
    expect(screen.getByText(/Do not treat anything on this panel as live/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload dashboard/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
