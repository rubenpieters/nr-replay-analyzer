import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { parseReplayFromString } from "./analyzer.js";
import { generateHtml } from "./htmlOutput.js";
import { anonymizeRawJson, anonymizeParsed } from "./anonymize.js";
import { CardDb } from "./cardDb.js";

const JOBS = ["replay_examples", "ms_st", "ms_nost", "az"];

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const cardDb = new CardDb(JSON.parse(readFileSync(join(root, "cards", "cards.json"), "utf-8")));
const errors: string[] = [];

for (const dir of JOBS) {
  const src = join(root, "replays", dir);
  const dstJson = join(root, "replays_out", dir);
  const dstHtml = join(root, "replays_html", dir);

  if (!existsSync(src)) {
    console.log(`Skipping replays/${dir}/ (not found)`);
    continue;
  }

  mkdirSync(dstJson, { recursive: true });
  mkdirSync(dstHtml, { recursive: true });

  const replays = readdirSync(src)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const replayFile of replays) {
    const replayPath = join(src, replayFile);
    const stem = basename(replayFile, ".json");
    const outJson = join(dstJson, `${stem}_output.json`);
    const outHtml = join(dstHtml, `${stem}_output.html`);

    try {
      const text = readFileSync(replayPath, "utf-8");
      const data = parseReplayFromString(text, cardDb);
      const anonData = anonymizeParsed(data);
      const anonRaw = anonymizeRawJson(text, data.summary.corp_player, data.summary.runner_player);
      writeFileSync(replayPath, anonRaw, "utf-8");
      writeFileSync(outJson, JSON.stringify(anonData, null, 2), "utf-8");
      writeFileSync(outHtml, generateHtml(anonData), "utf-8");
      console.log(`Wrote parsed replay to ${outJson}`);
      console.log(`Wrote HTML replay to ${outHtml}`);
    } catch (err) {
      console.error(`ERROR: ${replayPath} -> ${outJson}`);
      console.error(err);
      errors.push(replayPath);
    }
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} file(s) failed.`);
  process.exit(1);
}
