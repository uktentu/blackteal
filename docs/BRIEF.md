# BlackTeal — Frontend Engineering Exercise: Interactive Live Site Diagram

> Verbatim text extraction of `docs/Frontend_Exercise_Interactive_Site_Diagram.pdf` (10 pages).
> This is the **source of truth** for what is graded. `CLAUDE.md` at the repo root is our
> *interpretation and implementation plan*; where the two disagree, this file wins.

---

## Intro

BlackTeal builds monitoring software for battery energy storage systems (BESS) that support
large electrical loads such as data centers. This exercise mirrors real work you'd do on the
team: building operator-facing interfaces for live power-system data.

> Please build this as soon as you can. We're keen to see it working — **prioritize a clean,
> functional result over exhaustive polish**, with a short README covering how to run it and the
> trade-offs you made. We want to see how you structure code, handle live data, and deal with
> edge cases.

## The scenario

A site has a grid connection through a substation, several power skids (each skid contains a
transformer, an inverter, and a battery), and a data-center load. Operators watch this site live
and need to spot and diagnose problems quickly.

**Figure 1 — Reference site layout.** Transmission (138 kV) → Substation (138 / 34.5 kV) → BESS
Skids (6 × 2.5 MW / 10 MWh) → Data Center (~38 MW). Legend: Normal / Warning / Fault / Offline.
The "+" markers indicate assets an operator can click to inspect — that click-to-inspect
interaction is what you'll build. *(A simple diagram like this is perfectly fine; the art is not
what we're evaluating.)*

## Your task

Build a small web app showing an interactive diagram of the site, where:

1. Each asset shows its live status — NORMAL / WARNING / FAULT / OFFLINE — plus a key metric.
2. Clicking an asset opens a detail/debug panel with its live telemetry, any active alarms, and
   its connection health.
3. Data updates live, and the UI clearly shows when data is stale/disconnected (never present
   frozen values as live).

## What we provide

Everything you need is in the Site Data Pack at the end of this document: the site topology,
nameplate specifications, the telemetry schema with units and normal ranges, an alarm catalog,
and a realistic snapshot to render. No backend, accounts, or external data required — simulate
the live feed yourself (guidance included).

## Requirements — must-have

- Render the site from the topology: the substation, the skids, and the load, with the
  connections between them.
- Show live status per asset using color **and a label/icon (don't rely on color alone)**.
- Click an asset → a detail panel with its live telemetry, active alarms, and **connection
  health**.
- Live updates, plus a clear stale/disconnected indication when the feed stops.
- A short README: how to run it (ideally one or two commands), and notes on your trade-offs and
  what you'd do with more time.

## Build these stages

Get the core (above) working first, then extend it. **Stages 1–2 are what we most want to see;
3–4 are bonus.**

### Stage 1 — Alarm console — *expected*

- A site-wide alarm list, priority-sorted (critical above warning), showing the asset and message.
- Acknowledge and shelve (temporarily silence) an alarm.
- Filter by asset and severity.
- Flood handling: when many related alarms arrive at once, roll them into one grouped, counted
  entry — not a wall of rows.

> **Why it matters:** real operators can act on only ~6–12 alarms/hour, so surfacing the one that
> matters — and not burying it — is the whole job.

### Stage 2 — Operator-grade styling — *expected*

- Follow the High-Performance HMI convention: keep most of the screen calm and neutral (gray),
  and use color only to mean "look here now."
- **Muted color for warnings, saturated for critical.** A healthy site should look quiet; an
  abnormal one should jump out at a glance.

> **Why it matters:** it's the control-room standard (ISA-101) — a busy, colorful dashboard
> actually slows operators down.

### Stage 3 — Trends & headroom — *bonus*

- In the detail panel, a sparkline of a key metric's recent history.
- Show each battery's headroom against its operating envelope — how much charge/discharge margin
  is left, and why it's derated.

### Stage 4 — Explain the state — *bonus*

- For each abnormal asset, one plain-language line — e.g. "Skid 2 derated: a module is at 41 °C,
  so discharge is capped to 1.5 MW." Simple rules are fine (no AI needed).

### Also welcome (small extras)

- Power-flow **direction/magnitude on the connections**;
- a couple of **tests** around your state/data logic;
- **zoom/pan** or a **responsive layout**.

## Out of scope — please don't spend time here

- **No control actions.** This exercise is monitoring/visualization only — read-only.
- **No authentication, no real backend, no database.**
- **No pixel-perfect graphics.** A clean, simple diagram (boxes, circles, lines) is exactly
  right — we care about the interaction and data handling, not the art.

## What we're looking for

- Clear, readable, well-organized code.
- Sensible handling of real-time updates and **edge cases — missing metrics, an offline asset, a
  stale feed, alarm bursts**.
- Alarm handling that cuts noise — the operator sees what matters, not a wall of rows.
- Situational awareness — can someone glance at the screen and instantly tell whether the site is
  healthy?
- A drill-down an operator could actually use: after clicking an asset, can you understand its
  situation quickly?
- Good judgment on trade-offs, explained briefly in your README.

## Tech & submission

- Use whatever you're most productive in. Our stack is React + TypeScript, so that's welcome, but
  pick what lets you do your best work.
- Deliver a runnable app: a link to a Git repository (or a zip), including the README.
- Send it to **careers@blackteal.com**. Questions any time at the same address.

---

# APPENDIX — Site Data Pack

Input data for the exercise. All values are representative of a real grid-connected battery +
data-center site, but are synthetic — they don't come from any live system. **Feel free to vary
them.**

## 1 · Plant overview

| | |
|---|---|
| Grid interconnection | 138 kV, 3-phase, 60 Hz |
| Battery energy storage (BESS) | 15 MW / 60 MWh (4-hour), LFP chemistry |
| Power skids | 6 skids, each 2.5 MW / 10 MWh (transformer + inverter + battery) |
| Data-center load | ~38 MW facility (PUE ≈ 1.33) |
| Role | Peak-shaving + backup for the data center |

**Flow:** Grid (138 kV) → main transformer → 34.5 kV bus → 6 feeders → power skids (each steps
down to 690 V and ties a battery in via a bidirectional inverter) → data-center load.

## 2 · Topology

```json
{
  "assets": [
    { "id": "SUBSTATION", "type": "substation", "label": "Grid / Substation (138 kV)", "x": 80, "y": 160 },
    { "id": "SKID-1", "type": "skid", "label": "Power Skid 1", "x": 300, "y": 40 },
    { "id": "SKID-2", "type": "skid", "label": "Power Skid 2", "x": 300, "y": 110 },
    { "id": "SKID-3", "type": "skid", "label": "Power Skid 3", "x": 300, "y": 180 },
    { "id": "SKID-4", "type": "skid", "label": "Power Skid 4", "x": 300, "y": 250 },
    { "id": "SKID-5", "type": "skid", "label": "Power Skid 5", "x": 300, "y": 320 },
    { "id": "SKID-6", "type": "skid", "label": "Power Skid 6", "x": 300, "y": 390 },
    { "id": "LOAD", "type": "load", "label": "Data Center Load", "x": 540, "y": 215 }
  ],
  "links": [
    { "from": "SUBSTATION", "to": "SKID-1" }, { "from": "SUBSTATION", "to": "SKID-2" },
    { "from": "SUBSTATION", "to": "SKID-3" }, { "from": "SUBSTATION", "to": "SKID-4" },
    { "from": "SUBSTATION", "to": "SKID-5" }, { "from": "SUBSTATION", "to": "SKID-6" },
    { "from": "SKID-1", "to": "LOAD" }, { "from": "SKID-2", "to": "LOAD" },
    { "from": "SKID-3", "to": "LOAD" }, { "from": "SKID-4", "to": "LOAD" },
    { "from": "SKID-5", "to": "LOAD" }, { "from": "SKID-6", "to": "LOAD" }
  ]
}
```

## 3 · Nameplate specifications

| Asset | Rating |
|---|---|
| Grid interconnection | 138 kV, 3-phase, 60 Hz |
| Main power transformer | 138 / 34.5 kV, 50 MVA, on-load tap changer |
| Medium-voltage bus | 34.5 kV |
| Skid transformer (×6) | 34.5 kV / 690 V, 3 MVA |
| Inverter / PCS (×6) | 2.5 MW bidirectional, 690 V AC, up to 1500 V DC |
| Battery container (×6) | 10 MWh LFP, ~1330 V nominal DC |
| Data-center load | ~38 MW facility |

Battery internals (typical LFP): 3.2 V / 314 Ah cells (~1.0 kWh each); ~416 cells in series per
string (~1331 V nominal); ~24 parallel strings per container ≈ 10 MWh.

## 4 · Telemetry schema

Every asset reports a `state ∈ NORMAL | WARNING | FAULT | OFFLINE` and an `alarms` array.

### Substation / grid

| field | unit | normal range |
|---|---|---|
| voltage_kV | kV | 131–145 (138 ± 5%) |
| frequency_Hz | Hz | 59.95–60.05 |
| power_MW | MW | ±50 · + = import, − = export |
| power_factor | – | 0.95–1.00 |
| main_tx_oil_temp_C | °C | 40–75 |
| main_tx_loading_pct | % | 0–100 |

### Skid → inverter (PCS)

| field | unit | normal range |
|---|---|---|
| power_kW | kW | −2500…+2500 · + = charge, − = discharge |
| mode | enum | CHARGE / DISCHARGE / IDLE / FAULT |
| ac_voltage_V | V | ~690 |
| ac_current_A | A | 0–2100 |
| dc_voltage_V | V | 1150–1500 |
| efficiency_pct | % | 96–99 |
| igbt_temp_C | °C | 30–65 (warn > 75) |

### Skid → battery

| field | unit | normal range |
|---|---|---|
| soc_pct | % | 10–95 |
| soh_pct | % | 80–100 (warn < 80) |
| dc_bus_V | V | 1150–1500 |
| current_A | A | 0–1900 |
| power_kW | kW | −2500…+2500 |
| c_rate | C | 0–0.25 |
| cell_v_min / avg / max | V | 2.80–3.65 |
| cell_temp_min / avg / max | °C | 15–40 (warn > 40) |
| cell_temp_delta_C | °C | 0–8 (warn > 8) |
| insulation_MOhm | MΩ | > 1.0 |
| strings_online | count | of 24 |
| envelope.max_charge_kW | kW | 0–2500 |
| envelope.max_discharge_kW | kW | 0–2500 |

> The operating envelope is the max charge/discharge power the battery safely allows **right
> now**. It can be derated below nameplate (e.g., when a cell is hot). **Show it in the panel** —
> an operator needs to know *why* a skid can't deliver full power.

### Skid → transformer · Data-center load

| field | unit | normal range |
|---|---|---|
| transformer.temp_C | °C | 40–90 |
| transformer.loading_pct | % | 0–100 |
| load.power_MW | MW | 0–40 |
| load.it_load_MW | MW | 0–30 |
| load.pue | – | 1.2–1.5 |

## 5 · Alarm catalog

| code | severity | trigger | meaning |
|---|---|---|---|
| CELL_OV_WARN | warning | cell V > 3.55 | approaching overvoltage |
| CELL_OV | critical | cell V > 3.65 | overvoltage |
| CELL_UV_WARN | warning | cell V < 3.00 | approaching undervoltage |
| CELL_UV | critical | cell V < 2.80 | undervoltage |
| TEMP_HIGH | warning | cell temp > 40 °C | elevated temperature |
| TEMP_CRIT | critical | cell temp > 50 °C | over-temp — derate/stop |
| TEMP_DELTA | warning | max − min cell temp > 8 °C | thermal imbalance |
| SOC_LOW | warning | SoC < 10% | low state of charge |
| INSULATION_LOW | warning | IMD < 1.0 MΩ | insulation degraded |
| INSULATION_CRIT | critical | IMD < 0.5 MΩ | ground-fault risk |
| DC_OVERCURRENT | critical | current > rating | overcurrent |
| COMMS_LOST | critical | no telemetry from asset | asset offline |
| HVAC_FAULT | warning | cooling system fault | thermal management degraded |
| SOH_DEGRADED | warning | SoH < 80% | end-of-life approaching |
| GRID_FREQ | warning | freq outside 59.5–60.5 Hz | grid frequency excursion |

## 6 · Live snapshot (one frame to render)

**Scenario:** the BESS is discharging to support the data-center load. Skid 2 has an
elevated-temperature warning (and is derated); Skid 5 is offline (comms lost). Grid import ≈
facility load − BESS output.

> **Note the heterogeneous shape:** SKID-3, SKID-4 and SKID-6 omit `ac_voltage_V`,
> `ac_current_A` and `efficiency_pct` from their `pcs` object. SKID-5 has `pcs`, `battery` and
> `transformer` all `null`. This is the "missing metrics" edge case the brief grades on — it is
> deliberate, not a transcription error.

```json
{
  "stale": false,
  "assets": {
    "SUBSTATION": {
      "state": "NORMAL",
      "metrics": { "voltage_kV": 138.4, "frequency_Hz": 60.01, "power_MW": 28.5, "power_factor": 0.994, "main_tx_oil_temp_C": 58, "main_tx_loading_pct": 57 },
      "alarms": []
    },
    "SKID-1": {
      "state": "NORMAL",
      "pcs": { "state": "NORMAL", "power_kW": -1984, "mode": "DISCHARGE", "ac_voltage_V": 689, "ac_current_A": 1673, "dc_voltage_V": 1330, "efficiency_pct": 98.2, "igbt_temp_C": 48 },
      "battery": { "state": "NORMAL", "soc_pct": 61, "soh_pct": 97.3, "dc_bus_V": 1330, "current_A": 1519, "power_kW": -2020, "c_rate": 0.20, "cell_v_min": 3.181, "cell_v_avg": 3.198, "cell_v_max": 3.229, "cell_temp_min_C": 29.4, "cell_temp_avg_C": 31.6, "cell_temp_max_C": 33.8, "cell_temp_delta_C": 4.4, "insulation_MOhm": 3.2, "strings_online": 24, "envelope": { "max_charge_kW": 2500, "max_discharge_kW": 2500 } },
      "transformer": { "state": "NORMAL", "temp_C": 63, "loading_pct": 79 },
      "alarms": []
    },
    "SKID-2": {
      "state": "WARNING",
      "pcs": { "state": "NORMAL", "power_kW": -1480, "mode": "DISCHARGE", "ac_voltage_V": 690, "ac_current_A": 1247, "dc_voltage_V": 1333, "efficiency_pct": 98.1, "igbt_temp_C": 52 },
      "battery": { "state": "WARNING", "soc_pct": 58, "soh_pct": 96.1, "dc_bus_V": 1333, "current_A": 1132, "power_kW": -1509, "c_rate": 0.15, "cell_v_min": 3.176, "cell_v_avg": 3.205, "cell_v_max": 3.241, "cell_temp_min_C": 33.1, "cell_temp_avg_C": 37.8, "cell_temp_max_C": 41.2, "cell_temp_delta_C": 8.1, "insulation_MOhm": 2.7, "strings_online": 24, "envelope": { "max_charge_kW": 2500, "max_discharge_kW": 1500 } },
      "transformer": { "state": "NORMAL", "temp_C": 66, "loading_pct": 60 },
      "alarms": [
        { "code": "TEMP_HIGH", "severity": "warning", "message": "Battery module temperature elevated (max 41.2 C)" },
        { "code": "TEMP_DELTA", "severity": "warning", "message": "Cell temperature spread 8.1 C - discharge derated" }
      ]
    },
    "SKID-3": {
      "state": "NORMAL",
      "pcs": { "state": "NORMAL", "power_kW": -2060, "mode": "DISCHARGE", "dc_voltage_V": 1329, "igbt_temp_C": 49 },
      "battery": { "state": "NORMAL", "soc_pct": 60, "soh_pct": 97.6, "dc_bus_V": 1329, "current_A": 1578, "power_kW": -2097, "c_rate": 0.21, "cell_v_min": 3.178, "cell_v_avg": 3.195, "cell_v_max": 3.224, "cell_temp_min_C": 28.9, "cell_temp_avg_C": 31.1, "cell_temp_max_C": 33.2, "cell_temp_delta_C": 4.3, "insulation_MOhm": 3.4, "strings_online": 24, "envelope": { "max_charge_kW": 2500, "max_discharge_kW": 2500 } },
      "transformer": { "state": "NORMAL", "temp_C": 64, "loading_pct": 82 },
      "alarms": []
    },
    "SKID-4": {
      "state": "NORMAL",
      "pcs": { "state": "NORMAL", "power_kW": -1912, "mode": "DISCHARGE", "dc_voltage_V": 1331, "igbt_temp_C": 47 },
      "battery": { "state": "NORMAL", "soc_pct": 62, "soh_pct": 98.0, "dc_bus_V": 1331, "current_A": 1464, "power_kW": -1948, "c_rate": 0.19, "cell_v_min": 3.184, "cell_v_avg": 3.199, "cell_v_max": 3.226, "cell_temp_min_C": 27.8, "cell_temp_avg_C": 30.4, "cell_temp_max_C": 32.6, "cell_temp_delta_C": 4.8, "insulation_MOhm": 3.6, "strings_online": 24, "envelope": { "max_charge_kW": 2500, "max_discharge_kW": 2500 } },
      "transformer": { "state": "NORMAL", "temp_C": 61, "loading_pct": 76 },
      "alarms": []
    },
    "SKID-5": {
      "state": "OFFLINE",
      "pcs": null, "battery": null, "transformer": null,
      "alarms": [ { "code": "COMMS_LOST", "severity": "critical", "message": "No telemetry received from skid" } ]
    },
    "SKID-6": {
      "state": "NORMAL",
      "pcs": { "state": "NORMAL", "power_kW": -1960, "mode": "DISCHARGE", "dc_voltage_V": 1332, "igbt_temp_C": 48 },
      "battery": { "state": "NORMAL", "soc_pct": 59, "soh_pct": 97.1, "dc_bus_V": 1332, "current_A": 1500, "power_kW": -1998, "c_rate": 0.20, "cell_v_min": 3.180, "cell_v_avg": 3.202, "cell_v_max": 3.231, "cell_temp_min_C": 29.0, "cell_temp_avg_C": 31.9, "cell_temp_max_C": 34.1, "cell_temp_delta_C": 5.1, "insulation_MOhm": 3.1, "strings_online": 24, "envelope": { "max_charge_kW": 2500, "max_discharge_kW": 2500 } },
      "transformer": { "state": "NORMAL", "temp_C": 62, "loading_pct": 78 },
      "alarms": []
    },
    "LOAD": {
      "state": "NORMAL",
      "metrics": { "power_MW": 37.9, "it_load_MW": 28.5, "pue": 1.33, "voltage_kV": 34.5 },
      "alarms": []
    }
  }
}
```

**Power balance (sanity check):** total skid discharge ≈ 9.4 MW; grid import 28.5 MW + BESS
9.4 MW ≈ 37.9 MW load. *Small mismatches are normal (conversion losses, measurement).*

## 7 · Simulating a live feed

Push updated frames periodically. To keep it believable:

- Jitter analog values **±0.3–0.5% each frame** (voltages, currents, temps, power).
- Keep the balance: `grid.power_MW ≈ load.power_MW − Σ(skid discharge)`.
- Occasionally change a state — e.g., clear Skid 2's warning as it cools, or bring Skid 5 back
  online — so the UI's state transitions are visible.
- Simulate a dropout by setting `"stale": true` (or simply stopping the frames) so we can see how
  your UI flags a disconnected feed.
- Fire an **alarm burst** — e.g. 15+ alarms across the skids within a few seconds — so we can see
  your flood handling (Stage 1).
