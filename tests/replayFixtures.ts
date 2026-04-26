import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseReplayFromString } from "../src/analyzer.js";
import { CardDb } from "../src/cardDb.js";
import type { SlimCard } from "../src/cardDb.js";

export const DIRS = ["az", "ms_nost", "ms_st", "replay_examples"] as const;

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

export const cardDb = CardDb.fromSlimData(
  JSON.parse(readFileSync(join(root, "cards", "cards-slim.json"), "utf-8")) as SlimCard[]
);

export interface ReplayEntry {
  dir: string;
  stem: string;
  replayPath: string;
  goldenPath: string;
  getEconomy: () => ReturnType<typeof parseReplayFromString>["economy"];
}

export function forEachReplay(cb: (entry: ReplayEntry) => void): void {
  for (const dir of DIRS) {
    const replayDir = join(root, "replays", dir);
    const goldenDir = join(root, "test", "golden", dir);
    for (const file of readdirSync(replayDir).filter((f) => f.endsWith(".json")).sort()) {
      const stem = file.replace(/\.json$/, "");
      cb({
        dir,
        stem,
        replayPath: join(replayDir, file),
        goldenPath: join(goldenDir, `${stem}.economy.json`),
        getEconomy: () => {
          const text = readFileSync(join(replayDir, file), "utf-8");
          return parseReplayFromString(text, cardDb).economy;
        },
      });
    }
  }
}
