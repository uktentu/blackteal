# Interactive Live Site Diagram — BlackTeal frontend exercise

> **Live demo:** _(deploy link goes here — the brief asks for it at the top of this file)_

An operator-facing monitoring view for a grid-connected battery energy storage system (BESS)
supporting a ~38 MW data-center load: a live site diagram, per-asset drill-down, and an alarm
console built to High-Performance HMI (ISA-101) conventions.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # typecheck + production build to dist/
npm test             # simulator and rule-engine tests
npm run check        # typecheck + lint + tests
```

No backend, no accounts, no database — the live feed is simulated entirely in the browser.

## Status

🚧 **In progress.** Project scaffolded; the site data pack is transcribed and under test in
[src/domain/](src/domain/). The simulator, rule engine, diagram, detail drawer and alarm console
are next — see [CLAUDE.md](CLAUDE.md) §1 for the build order.

## Trade-offs and what I'd do with more time

_To be written before submission. The brief grades this section explicitly — see
[.claude/references/grading-checklist.md](.claude/references/grading-checklist.md) item A13._

## Project layout

| Path | What's in it |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | The exercise brief, extracted from the source PDF. Source of truth. |
| [CLAUDE.md](CLAUDE.md) | Implementation plan, architecture and UX decisions, repo conventions. |
| [src/domain/](src/domain/) | Types, topology, alarm catalog, initial snapshot — pure data, no React. |
| `src/sim/` | Pure simulator + rule engine. Independently testable, no React. |
| `src/store/` | Zustand store. One update per simulation tick. |
| `src/components/` | Diagram (SVG), detail drawer, alarm console, top strip. |
| [.claude/](.claude/) | Project references, review agents, and skills. |
