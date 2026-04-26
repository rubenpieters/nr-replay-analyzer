import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseReplayFromString } from "../src/analyzer.js";
import { CardDb } from "../src/cardDb.js";
import type { SlimCard } from "../src/cardDb.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const cardDb = CardDb.fromSlimData(
  JSON.parse(readFileSync(join(root, "cards", "cards-slim.json"), "utf-8")) as SlimCard[]
);

const DIRS = ["az", "ms_nost", "ms_st", "replay_examples"];

for (const dir of DIRS) {
  const replayDir = join(root, "replays", dir);
  const goldenDir = join(root, "test", "golden", dir);
  const files = readdirSync(replayDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  describe(dir, () => {
    for (const file of files) {
      const stem = file.replace(/\.json$/, "");
      it(stem, () => {
        const text = readFileSync(join(replayDir, file), "utf-8");
        const data = parseReplayFromString(text, cardDb);
        const golden = JSON.parse(readFileSync(join(goldenDir, `${stem}.economy.json`), "utf-8"));
        expect(data.economy).toEqual(golden);
      });
    }
  });
}
