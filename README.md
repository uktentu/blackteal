# Interactive Live Site Diagram — BlackTeal frontend exercise

> **Live demo:** _add the deploy URL here before sending_

An operator-facing monitoring view for a grid-connected BESS supporting a ~38 MW data-center
load: a live single-line diagram, per-asset drill-down, and an alarm console built to
High-Performance HMI (ISA-101) conventions.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm test             # 73 tests over the simulator, rule engine and alarm feed
npm run build        # typecheck + production build to dist/
npm run check        # typecheck + lint + tests
```

No backend, no accounts, no database — the live feed is simulated in the browser.

## What to look at first

Everything below happens **unattended within the first minute**, so there's nothing to set up:

| When | What |
|---|---|
| t+0 | The brief's snapshot renders exactly as given — Skid 2 derated and warning, Skid 5 offline |
| ~t+10 s | Skid 2 cools, its warning clears, and its envelope un-derates 1.5 → 2.5 MW |
| ~t+22 s | **Alarm burst** — 15+ alarms across four skids roll into a handful of grouped rows |
| ~t+42 s | Skid 5 reconnects, OFFLINE → NORMAL |

Both demo triggers are also buttons in the top strip: **Simulate alarm burst** and **Simulate
dropout**. Click a skid to open its drawer; `Esc` closes it and `↑`/`↓` cycle assets.

Worth opening deliberately: **Skid 3** (the brief omits three of its PCS fields — they render
as `—`, never as `0`) and **Skid 5** (fully offline; the panel still opens and explains why
there's no data).

## How it's built

```
src/domain/    types, topology, alarm catalog, initial snapshot — pure data, no React
src/sim/       simulator, rule engine, scenarios, alarm feed — pure functions, no React
src/store/     Zustand store; one simulation tick produces exactly one update
src/components/ diagram (SVG), drawer, alarm console, top strip
```

**The rule engine is a table, not a pile of `if`s.** `evaluateSkid(telemetry)` walks the alarm
catalog and applies thresholds to raw values. Everything else falls out of that: the alarm
message, the derate reason, and the Stage 4 explanation are all built from *the rule that
fired*, so there is no second set of strings to drift out of sync with the thresholds.

**The simulator is deterministic and independently testable.** One tick is `jitter →
scenarios → enforce envelope → re-solve power balance → re-derive alarms`. Grid import is
*solved* from `load − Σ(skid discharge)`, never jittered on its own, and jitter carries a
restoring pull toward each anchor so a long session can't drift a metric out of band and fire
phantom alarms.

**Scenarios move telemetry; they never inject alarms.** To create an alarm the simulator drives
the underlying metric across its threshold and lets the rules fire. A hand-injected alarm would
have no telemetry behind it, so the panel would show an alarm whose metrics look fine.

## Design notes (Stage 2)

The palette was verified numerically rather than eyeballed — the script that checks it lives in
`.claude/references/design-system.md`:

- **Severity is ranked by saturation, not brightness.** Warning is 47% saturated, fault 84% — a
  37-point gap. Red can't out-luminance amber without turning pink, so luminance is spent
  elsewhere (below) and the *saturation* gap carries "which of these is worse."
- **Every state survives a grayscale screenshot.** Perceived-gray ladder 38 / 46 / 53 / 60, so
  the four states stay distinguishable with hue removed — before the icon and text label are
  even considered. Status is always dot **+** form **+** text.
- **Normal is gray, not green.** Six green skids would be six salient regions competing with the
  one amber skid that needs attention. Green appears once, in the legend.
- **Offline is a dashed stroke, not a color** — it's absence of information, not a process state.
- **Only faults animate.** Metric numbers update instantly with no transition; animating every
  jittered decimal creates constant motion, which is itself a violation of "calm dashboard."
- **BlackTeal's brand orange is interaction-only** — selection, focus, the click-to-inspect "+"
  echoing their own Figure 1. Never a status color, because it sits between amber and red and
  would blur the gap above.
- `tabular-nums` on every changing numeral, and `prefers-reduced-motion` honoured throughout.

## Trade-offs, and what I'd do with more time

**System fonts over a self-hosted webfont.** Zero network requests and no FOUT, and SF Mono has
true tabular figures on the reviewer's Mac. The cost is that rendering differs across macOS,
Windows and Linux. With more time I'd self-host IBM Plex Sans + Plex Mono for identical
rendering — it's ~80 KB and worth it in a product, but not worth the setup here.

**No virtualization in the alarm console.** The brief's scale is dozens of rows, not thousands,
so virtualizing would add complexity and break the enter/exit animations for no measurable gain.
At 10k+ rows this would need revisiting.

**Flood grouping threshold is 3, and it's a judgement call.** Below three, individual rows carry
more information than a group — "TEMP_HIGH ×2" tells an operator less than seeing *which* two
skids. Above three it's noise. A real system would make this configurable per code and probably
time-boxed (group only alarms arriving within N seconds), which I'd add next.

**Ack clears when the alarm clears; shelve persists.** A recurring condition should re-demand
attention, but shelving is an explicit operator decision. Real shelving is also time-boxed —
"silence for 4 hours" — which I'd add with a countdown in the row.

**No zoom/pan on the diagram.** At eight assets it isn't needed and would have cost time better
spent on the alarm console. The layout is responsive (the drawer overlays rather than squeezing
the diagram below 1100px) and the SVG scales, but there's no pan/zoom for a 60-skid site.

**History is in-memory only**, 60 samples per asset for the sparklines. Nothing persists across
a reload. A real deployment reads a historian.

**No E2E test suite.** The graded logic — simulator, rules, alarm feed — is pure and covered by
73 unit tests. UI behaviour I verified by driving a headless browser and inspecting screenshots
rather than by writing Playwright specs, which would have been the better long-term investment
if this were going to keep growing.

**What I'd build next, in order:** time-boxed shelving with a countdown; grouping by *time
window* as well as code; an alarm history/event log (currently only active alarms are visible,
so an alarm that self-clears leaves no trace); and per-subsystem state on the diagram node so a
PCS fault and a battery fault are distinguishable without opening the drawer.

## Domain vocabulary

Used throughout, and defined in `.claude/references/domain-glossary.md`: PCS, IGBT, SoC/SoH,
IMD/insulation, C-rate, operating envelope, derate, headroom, PUE, alarm shelving, HPHMI.

## Source material

`docs/BRIEF.md` is a text extraction of the provided PDF, kept as the source of truth.
`docs/Frontend_Exercise_Interactive_Site_Diagram.pdf` is the original.
