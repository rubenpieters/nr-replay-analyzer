import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseReplayFromString } from "./analyzer.js";
import { generateHtml } from "./htmlOutput.js";
import { CardDb } from "./cardDb.js";

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  console.error(`Usage: node dist/main.js <replay_file.json> [output_file.json]`);
  process.exit(1);
}

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const cardDb = new CardDb(JSON.parse(readFileSync(join(root, "cards", "cards.json"), "utf-8")));

const replayText = readFileSync(args[0], "utf-8");
const data = parseReplayFromString(replayText, cardDb);

if (args[1]) {
  writeFileSync(args[1], JSON.stringify(data, null, 2), "utf-8");
  console.log(`Wrote parsed replay to ${args[1]}`);
  const htmlPath = args[1].replace(/\.json$/, ".html");
  writeFileSync(htmlPath, generateHtml(data), "utf-8");
  console.log(`Wrote HTML replay to ${htmlPath}`);
} else {
  const s = data.summary;
  console.log("=== Replay Summary ===");
  console.log(`Corp:   ${s.corp_player} (${s.corp_identity})`);
  console.log(`Runner: ${s.runner_player} (${s.runner_identity})`);
  console.log(`Turns played:  ${s.turns}`);
  console.log(`Winner:        ${s.winner} (${s.win_reason})`);
  console.log(`Agenda points: Corp ${s.corp_agenda_points} / Runner ${s.runner_agenda_points}`);
}
