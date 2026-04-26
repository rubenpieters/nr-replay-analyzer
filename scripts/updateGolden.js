// Regenerates test/golden/**/*.economy.json from current replays.
// Run via: npm run test:update
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { parseReplayFromString } from "../dist/analyzer.js";
import { CardDb } from "../dist/cardDb.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const cardDb = CardDb.fromSlimData(
  JSON.parse(readFileSync(join(root, "cards", "cards-slim.json"), "utf-8"))
);

const DIRS = ["az", "ms_nost", "ms_st", "replay_examples"];

for (const dir of DIRS) {
  const replayDir = join(root, "replays", dir);
  const goldenDir = join(root, "test", "golden", dir);
  mkdirSync(goldenDir, { recursive: true });

  for (const file of readdirSync(replayDir).filter((f) => f.endsWith(".json")).sort()) {
    const stem = file.replace(/\.json$/, "");
    const text = readFileSync(join(replayDir, file), "utf-8");
    const data = parseReplayFromString(text, cardDb);
    const out = join(goldenDir, `${stem}.economy.json`);
    writeFileSync(out, JSON.stringify(data.economy, null, 2) + "\n");
    console.log(`Updated ${out}`);
  }
}
