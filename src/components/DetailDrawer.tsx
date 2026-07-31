/**
 * Detail drawer — the operator's drill-down.
 *
 * The brief names three things it must contain: live telemetry, active alarms, and connection
 * health. All three are here, in that order of prominence.
 *
 * A drawer, not a modal: the operator keeps sight of the diagram, and the selected asset keeps
 * a persistent highlight ring while this is open.
 */

import { memo, type Ref } from 'react';
import { NAMEPLATE, assetKind } from '../domain/topology';
import type { Alarm, Asset, SkidAsset, SubstationAsset, LoadAsset } from '../domain/types';
import { StatusIndicator } from './StatusIndicator';
import { Sparkline } from './Sparkline';
import { Headroom } from './Headroom';
import { derateCause, headroom } from '../sim/rules';
import { explainAsset } from '../sim/explain';
import type { AlarmEvent } from '../sim/alarmHistory';
import { EventLog } from './EventLog';
import { fmt, fmtAgo, fmtInt, NO_DATA, powerDirection, gridDirection } from './format';
import './drawer.css';

interface Props {
  /** Set by App so focus can be moved into the panel when it opens. */
  ref?: Ref<HTMLElement>;
  /** This asset's alarm history — a self-clearing alarm otherwise leaves no trace. */
  events: AlarmEvent[];
  assetId: string | null;
  label: string;
  asset: Asset | null;
  /** Recent samples of this asset's key metric, for the Stage 3 sparkline. */
  history: number[];
  stale: boolean;
  lastFrameAt: number;
  onClose: () => void;
}

export const DetailDrawer = memo(function DetailDrawer({
  ref,
  events,
  assetId,
  label,
  asset,
  history,
  stale,
  lastFrameAt,
  onClose,
}: Props) {
  const open = assetId !== null && asset !== null;

  return (
    <aside
      ref={ref}
      className="drawer"
      data-open={open || undefined}
      aria-hidden={!open}
      aria-label={open ? `${label} details` : undefined}
    >
      {open && asset !== null && (
        <>
          <header className="drawer-head">
            <div>
              <h2 className="drawer-title">{label}</h2>
              <span className="drawer-id metric">{assetId}</span>
            </div>
            <StatusIndicator state={asset.state} />
            <button type="button" className="drawer-close" onClick={onClose} aria-label="Close (Esc)">
              ✕
            </button>
          </header>

          <div className="drawer-scroll">
            {/* Stage 4: the plain-language line comes first — it is the answer to "what is
                wrong here", which is why the operator opened this panel. */}
            <Explanation label={label} asset={asset} />
            <ConnectionHealth asset={asset} stale={stale} lastFrameAt={lastFrameAt} />
            <TrendSection asset={asset} history={history} />
            <AlarmSection alarms={asset.alarms} />

            <section className="drawer-section">
              <h3 className="label">Recent alarm activity</h3>
              <EventLog events={events} assetId={assetId} />
            </section>

            <Telemetry assetId={assetId} asset={asset} />
          </div>

          <footer className="drawer-foot">
            <kbd>Esc</kbd> close · <kbd>↑</kbd><kbd>↓</kbd> cycle assets
          </footer>
        </>
      )}
    </aside>
  );
});

/** Stage 4 — one plain-language line, rule-derived. Absent when the asset is healthy. */
function Explanation({ label, asset }: { label: string; asset: Asset }) {
  const text = explainAsset(label, asset);
  if (text === null) return null;

  return (
    <section className="drawer-explain" data-state={asset.state}>
      <p>{text}</p>
    </section>
  );
}

/** Stage 3 — sparkline of the key metric, plus headroom against the envelope for a skid. */
function TrendSection({ asset, history }: { asset: Asset; history: number[] }) {
  const isSkid = 'pcs' in asset;
  const skid = isSkid ? (asset as SkidAsset) : null;
  const h = skid ? headroom(skid.battery, NAMEPLATE.pcs_kW) : null;
  const cause = skid ? derateCause(skid.alarms) : null;

  const tone = asset.state === 'FAULT' ? 'fault' : asset.state === 'WARNING' ? 'warning' : 'normal';

  return (
    <section className="drawer-section">
      <h3 className="label">{isSkid ? 'Output — last 60 s' : 'Power — last 60 s'}</h3>
      <Sparkline values={history} tone={tone} />

      {h !== null && (
        <>
          <h3 className="label drawer-subhead">Headroom vs. operating envelope</h3>
          <Headroom
            nameplate_kW={NAMEPLATE.pcs_kW}
            envelope_kW={h.envelope_kW}
            output_kW={h.output_kW}
            derate_kW={h.derate_kW}
            headroom_kW={h.headroom_kW}
            reason={h.isDerated && cause !== null ? cause.message : null}
          />
        </>
      )}
    </section>
  );
}

/**
 * Connection health (checklist A8).
 *
 * Distinguishes two different failures that look identical if you're careless: THIS asset has
 * lost comms, versus the WHOLE feed has dropped. An operator needs to know whether to send
 * someone to the skid or to check the historian.
 */
function ConnectionHealth({
  asset,
  stale,
  lastFrameAt,
}: {
  asset: Asset;
  stale: boolean;
  lastFrameAt: number;
}) {
  const assetOffline = asset.state === 'OFFLINE';
  const since = Date.now() - lastFrameAt;

  const verdict = stale
    ? { tone: 'fault' as const, text: 'Site feed disconnected' }
    : assetOffline
      ? { tone: 'fault' as const, text: 'No telemetry from this asset' }
      : { tone: 'ok' as const, text: 'Receiving telemetry' };

  return (
    <section className="drawer-section">
      <h3 className="label">Connection health</h3>
      <div className="conn" data-tone={verdict.tone}>
        <span className="conn-verdict">{verdict.text}</span>
        <dl className="rows">
          <Row label="Last frame" value={stale ? fmtAgo(since) : '< 1s ago'} />
          <Row label="Update interval" value="1.0 s" />
          <Row
            label="Source"
            value={assetOffline ? 'Last known good' : stale ? 'Stale — not live' : 'Live'}
          />
        </dl>
      </div>

      {assetOffline && (
        <p className="drawer-note">
          This asset stopped reporting. Values elsewhere in this panel are unavailable rather
          than zero — nothing below is being measured right now.
        </p>
      )}
    </section>
  );
}

function AlarmSection({ alarms }: { alarms: Alarm[] }) {
  return (
    <section className="drawer-section">
      <h3 className="label">Active alarms ({alarms.length})</h3>
      {alarms.length === 0 ? (
        <p className="drawer-empty">No active alarms.</p>
      ) : (
        <ul className="drawer-alarms">
          {alarms.map((a) => (
            <li key={a.code} className="drawer-alarm" data-severity={a.severity}>
              <span className="drawer-alarm-code metric">{a.code}</span>
              <span className="drawer-alarm-msg">{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Telemetry({ assetId, asset }: { assetId: string; asset: Asset }) {
  // Discriminate on the topology, not on which optional fields happen to be present.
  switch (assetKind(assetId)) {
    case 'skid':
      return <SkidTelemetry skid={asset as SkidAsset} />;
    case 'load':
      return <LoadTelemetry load={asset as LoadAsset} />;
    default:
      return <SubstationTelemetry sub={asset as SubstationAsset} />;
  }
}

function SkidTelemetry({ skid }: { skid: SkidAsset }) {
  const { pcs, battery, transformer } = skid;
  const envelope = battery?.envelope;
  const derated =
    envelope?.max_discharge_kW != null && envelope.max_discharge_kW < NAMEPLATE.pcs_kW;

  return (
    <>
      <section className="drawer-section">
        <h3 className="label">Inverter / PCS</h3>
        {pcs === null ? (
          <NoTelemetry />
        ) : (
          <dl className="rows">
            <Row label="Power" value={fmt(pcs.power_kW, 0)} unit="kW" hint={powerDirection(pcs.power_kW)} />
            <Row label="Mode" value={pcs.mode ?? NO_DATA} />
            <Row label="AC voltage" value={fmt(pcs.ac_voltage_V, 0)} unit="V" />
            <Row label="AC current" value={fmt(pcs.ac_current_A, 0)} unit="A" />
            <Row label="DC voltage" value={fmt(pcs.dc_voltage_V, 0)} unit="V" />
            <Row label="Efficiency" value={fmt(pcs.efficiency_pct, 1)} unit="%" />
            <Row label="IGBT temp" value={fmt(pcs.igbt_temp_C, 0)} unit="°C" />
          </dl>
        )}
      </section>

      <section className="drawer-section">
        <h3 className="label">Battery</h3>
        {battery === null ? (
          <NoTelemetry />
        ) : (
          <dl className="rows">
            <Row label="State of charge" value={fmt(battery.soc_pct, 1)} unit="%" />
            <Row label="State of health" value={fmt(battery.soh_pct, 1)} unit="%" />
            <Row label="DC bus" value={fmt(battery.dc_bus_V, 0)} unit="V" />
            <Row label="Current" value={fmt(battery.current_A, 0)} unit="A" />
            <Row label="Power" value={fmt(battery.power_kW, 0)} unit="kW" />
            <Row label="C-rate" value={fmt(battery.c_rate, 2)} unit="C" />
            <Row
              label="Cell voltage"
              value={`${fmt(battery.cell_v_min, 3)} / ${fmt(battery.cell_v_avg, 3)} / ${fmt(battery.cell_v_max, 3)}`}
              unit="V"
              sub="min / avg / max"
            />
            <Row
              label="Cell temp"
              value={`${fmt(battery.cell_temp_min_C, 1)} / ${fmt(battery.cell_temp_avg_C, 1)} / ${fmt(battery.cell_temp_max_C, 1)}`}
              unit="°C"
              sub="min / avg / max"
            />
            <Row label="Temp spread" value={fmt(battery.cell_temp_delta_C, 1)} unit="°C" />
            <Row label="Insulation" value={fmt(battery.insulation_MOhm, 2)} unit="MΩ" />
            <Row
              label="Strings online"
              value={battery.strings_online == null ? NO_DATA : `${battery.strings_online} / 24`}
            />
          </dl>
        )}
      </section>

      {/* The envelope is core, not bonus: the brief says an operator needs to know why a skid
          can't deliver full power. */}
      {battery !== null && (
        <section className="drawer-section">
          <h3 className="label">Operating envelope</h3>
          <dl className="rows">
            <Row label="Max charge" value={fmtInt(envelope?.max_charge_kW)} unit="kW" />
            <Row
              label="Max discharge"
              value={fmtInt(envelope?.max_discharge_kW)}
              unit="kW"
              tone={derated ? 'warning' : undefined}
            />
            <Row label="Nameplate" value={fmtInt(NAMEPLATE.pcs_kW)} unit="kW" />
          </dl>
          {derated && (
            <p className="drawer-note" data-tone="warning">
              Derated {fmtInt(NAMEPLATE.pcs_kW - envelope!.max_discharge_kW!)} kW below nameplate.
            </p>
          )}
        </section>
      )}

      <section className="drawer-section">
        <h3 className="label">Transformer</h3>
        {transformer === null ? (
          <NoTelemetry />
        ) : (
          <dl className="rows">
            <Row label="Temperature" value={fmt(transformer.temp_C, 0)} unit="°C" />
            <Row label="Loading" value={fmt(transformer.loading_pct, 0)} unit="%" />
          </dl>
        )}
      </section>
    </>
  );
}

function SubstationTelemetry({ sub }: { sub: SubstationAsset }) {
  const m = sub.metrics;
  return (
    <section className="drawer-section">
      <h3 className="label">Grid / substation</h3>
      <dl className="rows">
        <Row label="Voltage" value={fmt(m.voltage_kV, 1)} unit="kV" />
        <Row label="Frequency" value={fmt(m.frequency_Hz, 2)} unit="Hz" />
        <Row label="Power" value={fmt(m.power_MW, 1)} unit="MW" hint={gridDirection(m.power_MW)} />
        <Row label="Power factor" value={fmt(m.power_factor, 3)} />
        <Row label="Main Tx oil temp" value={fmt(m.main_tx_oil_temp_C, 0)} unit="°C" />
        <Row label="Main Tx loading" value={fmt(m.main_tx_loading_pct, 0)} unit="%" />
      </dl>
    </section>
  );
}

function LoadTelemetry({ load }: { load: LoadAsset }) {
  const m = load.metrics;
  return (
    <section className="drawer-section">
      <h3 className="label">Data-center load</h3>
      <dl className="rows">
        <Row label="Facility power" value={fmt(m.power_MW, 1)} unit="MW" />
        <Row label="IT load" value={fmt(m.it_load_MW, 1)} unit="MW" />
        <Row label="PUE" value={fmt(m.pue, 2)} />
        <Row label="Bus voltage" value={fmt(m.voltage_kV, 1)} unit="kV" />
      </dl>
    </section>
  );
}

function NoTelemetry() {
  return <p className="drawer-empty">No telemetry — subsystem not reporting.</p>;
}

/**
 * One metric row. Missing values arrive here already formatted as NO_DATA and are styled
 * distinctly, so an absent metric can never be mistaken for a measured zero.
 */
function Row({
  label,
  value,
  unit,
  sub,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  hint?: string | null;
  tone?: 'warning';
}) {
  const missing = value === NO_DATA || value.includes(NO_DATA);

  return (
    <div className="row" data-missing={missing || undefined} data-tone={tone}>
      <dt className="row-label">
        {label}
        {sub !== undefined && <span className="row-sub">{sub}</span>}
      </dt>
      <dd className="row-value metric">
        {value}
        {unit !== undefined && !missing && <span className="row-unit">{unit}</span>}
        {hint != null && <span className="row-hint">{hint}</span>}
      </dd>
    </div>
  );
}
