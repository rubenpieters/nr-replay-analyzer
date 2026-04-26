import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { forEachReplay } from "../tests/replayFixtures.js";

forEachReplay(({ goldenPath, getEconomy }) => {
  mkdirSync(dirname(goldenPath), { recursive: true });
  writeFileSync(goldenPath, JSON.stringify(getEconomy(), null, 2) + "\n");
  console.log(`Updated ${goldenPath}`);
});
