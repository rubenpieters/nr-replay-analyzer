import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { forEachReplay } from "./replayFixtures.js";

forEachReplay(({ dir, stem, goldenPath, getEconomy }) => {
  describe(dir, () => {
    it(stem, () => {
      const golden = JSON.parse(readFileSync(goldenPath, "utf-8"));
      expect(getEconomy()).toEqual(golden);
    });
  });
});
