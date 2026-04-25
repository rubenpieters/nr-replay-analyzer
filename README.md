# NR Replay Analyzer

Analyzes raw Netrunner replay JSON files and produces structured economy/action summaries plus an HTML visualization.

## Prerequisites

- Node.js 20+
- npm 9+

## Install

```bash
npm install
```

## Build (CLI)

```bash
npm run build
```

This compiles TypeScript from `src/` to `dist/`.

## CLI Usage

Analyze a replay and print a summary to stdout:

```bash
node dist/main.js replays/az/replay1.json
```

Analyze a replay and write JSON + HTML output files:

```bash
node dist/main.js replays/az/replay1.json output/replay1_output.json
# Writes output/replay1_output.json and output/replay1_output.html
```

## Regenerate all golden outputs

Processes all replays in `replays/` and writes JSON output to `replays_out/` and HTML output to `replays_html/`, mirroring the same subdirectory structure:

```bash
npm run regenerate
```

## Web (browser)

`npm run build` also produces `dist/web.js`, a self-contained browser bundle. Open `index.html` directly in a browser, which allows to upload a `.json` replay file for the analyzer to render it inline.
